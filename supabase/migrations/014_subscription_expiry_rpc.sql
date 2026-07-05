-- Migration: Create transaction-safe bulk subscription expiration check function
CREATE OR REPLACE FUNCTION public.expire_subscriptions_cron()
RETURNS TABLE (expired_count INT)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  expired_row RECORD;
  expired_ids UUID[] := '{}';
  user_ids UUID[] := '{}';
  cur_time TIMESTAMPTZ := NOW();
BEGIN
  -- 1. Identify active expired subscriptions
  FOR expired_row IN 
    SELECT id, user_id, plan_id, activated_at
    FROM public.subscriptions
    WHERE status = 'ACTIVE' AND expires_at < cur_time
  LOOP
    expired_ids := array_append(expired_ids, expired_row.id);
    user_ids := array_append(user_ids, expired_row.user_id);
    
    -- Insert subscription logs in transaction
    INSERT INTO public.subscription_logs (user_id, plan_id, action, details)
    VALUES (
      expired_row.user_id, 
      expired_row.plan_id, 
      'EXPIRED', 
      'Subscription expired automatically via hourly cron cleanup. Activated at ' || expired_row.activated_at
    );
    
    -- Insert notification logs in transaction
    INSERT INTO public.notification_logs (user_id, title, message, is_read)
    VALUES (
      expired_row.user_id, 
      'Membership Expired', 
      'Your premium membership for plan ' || upper(replace(expired_row.plan_id, '_', ' ')) || ' has expired.',
      false
    );
  END LOOP;

  -- If nothing is expired, return early
  IF array_length(expired_ids, 1) IS NULL THEN
    RETURN QUERY SELECT 0;
    RETURN;
  END IF;

  -- 2. Set matching subscriptions status to EXPIRED
  UPDATE public.subscriptions
  SET status = 'EXPIRED'
  WHERE id = ANY(expired_ids);

  -- 3. Update users table set premium_access = false where they have no other active subscription left
  UPDATE public.users u
  SET premium_access = false
  WHERE id = ANY(user_ids)
    AND NOT EXISTS (
      SELECT 1 FROM public.subscriptions s
      WHERE s.user_id = u.id 
        AND s.status = 'ACTIVE'
        AND (s.expires_at > cur_time OR s.expires_at IS NULL)
    );

  RETURN QUERY SELECT array_length(expired_ids, 1);
END;
$$;
