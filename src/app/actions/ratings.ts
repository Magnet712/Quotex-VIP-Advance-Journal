'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

export async function submitRating(rating: number) {
  try {
    if (rating < 1 || rating > 5) {
      return { success: false, error: 'Rating must be between 1 and 5.' };
    }

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: 'Not authenticated.' };

    const { error } = await supabase
      .from('ratings')
      .upsert(
        { user_id: user.id, rating },
        { onConflict: 'user_id' }
      );

    if (error) return { success: false, error: error.message };

    revalidatePath('/');
    revalidatePath('/dashboard');
    return { success: true };
  } catch (err: any) {
    return { success: false, error: 'Failed to submit rating.' };
  }
}

export async function getAverageRating() {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('ratings')
      .select('rating');

    if (error) return { success: false, error: error.message, average: 0, count: 0 };

    if (!data || data.length === 0) {
      return { success: true, average: 0, count: 0 };
    }

    const total = data.reduce((sum, r) => sum + r.rating, 0);
    const average = Math.round((total / data.length) * 10) / 10;

    return { success: true, average, count: data.length };
  } catch (err: any) {
    return { success: false, error: 'Failed to fetch ratings.', average: 0, count: 0 };
  }
}

export async function getUserRating() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: true, rating: null };

    const { data, error } = await supabase
      .from('ratings')
      .select('rating')
      .eq('user_id', user.id)
      .single();

    if (error && error.code !== 'PGRST116') {
      return { success: false, error: error.message, rating: null };
    }

    return { success: true, rating: data?.rating || null };
  } catch (err: any) {
    return { success: false, error: 'Failed to fetch user rating.', rating: null };
  }
}
