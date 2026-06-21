# Deployment & Setup Guide - Quotex Advance Journal

This guide outlines the step-by-step instructions required to set up, run, and deploy the **Quotex Advance Journal** platform.

---

## 1. Local Development Setup

To run the platform on your local machine, follow these steps:

### Prerequisites
- Install [Node.js](https://nodejs.org/) (Version 18 or higher is recommended)
- Install Git

### Run the Application
1. Install project dependencies (already done in this workspace):
   ```bash
   npm install
   ```
2. Start the development server:
   ```bash
   npm run dev
   ```
3. Open your browser and navigate to `http://localhost:3000`.

---

## 2. Supabase Database Configuration

The application uses Supabase for database storage, authentication, and chart screenshot storage.

### Step 1: Create a Project
1. Sign in to the [Supabase Dashboard](https://supabase.com/).
2. Click **New Project** and configure your organization, project name, and database password.

### Step 2: Initialize Database Tables
1. In the Supabase project sidebar, click on **SQL Editor** &rarr; **New Query**.
2. Copy the entire contents of the SQL schema file located at:
   `supabase/schema.sql`
3. Paste the SQL statements into the editor and click **Run**. This will create the required `users`, `admins`, and `trades` tables, triggers, and Row Level Security (RLS) policies.

### Step 3: Configure Authentication
1. Go to **Authentication** &rarr; **Providers** &rarr; **Email**.
2. Toggle the **Confirm email** setting to **OFF**. 
   *(This is crucial because the application maps Trader IDs to virtual emails internally and bypasses standard confirmation checks).*

### Step 4: Setup Storage Buckets
1. Go to **Storage** &rarr; **New Bucket**.
2. Name the bucket exactly `trade-screenshots`.
3. Toggle the bucket privacy status to **Public**.

---

## 3. Environment Variables

Create a file named `.env.local` in the root of your project directory (or modify the template provided).

1. In Supabase, navigate to **Project Settings** &rarr; **API**.
2. Copy and paste the following parameters:
   ```env
   # Replace with your actual project URL
   NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co

   # Replace with your actual anon public api key
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-public-key

   # Replace with your actual service_role secret key
   SUPABASE_SERVICE_ROLE_KEY=your-secret-service-role-key
   ```

*Note: The `SUPABASE_SERVICE_ROLE_KEY` is a secret key that allows the server components to run admin operations (approving accounts and resetting passwords). Do not share it or check it into Git.*

---

## 4. Seed the System Admin Account

To access the administration portal at `/admin/login`, you must seed your first admin profile.

1. Start your local server and navigate to [http://localhost:3000/register-info](http://localhost:3000/register-info).
2. Submit a registration form with:
   - **Trader ID**: `admin@quotex.journal`
   - **Username**: `System Admin`
   - **Password**: Choose a secure password.
3. Open your **Supabase Dashboard** &rarr; **SQL Editor** &rarr; **New Query** and run the following script to elevate this account:
   ```sql
   -- 1. Insert admin metadata using the user ID found in auth.users
   INSERT INTO public.admins (id, email, role) 
   VALUES ((SELECT id FROM auth.users WHERE email = 'admin@quotex.journal'), 'admin@quotex.journal', 'admin');

   -- 2. Approve the admin's trader profile
   INSERT INTO public.users (id, trader_id, username, status) 
   VALUES ((SELECT id FROM auth.users WHERE email = 'admin@quotex.journal'), 'ADMIN', 'System Admin', 'approved');
   ```
4. Now, go to [http://localhost:3000/admin/login](http://localhost:3000/admin/login) and log in using `admin@quotex.journal` and your password.

---

## 5. GitHub Repository Push

The project is already tracked by Git locally. To link it to your GitHub profile:

1. Create a repository on GitHub named `Quotex-VIP-Advance-Journal`.
2. Link your local folder to GitHub:
   ```bash
   git remote add origin https://github.com/YOUR_USERNAME/Quotex-VIP-Advance-Journal.git
   git branch -M main
   git push -u origin main
   ```

---

## 6. Cloud Provider Deployment

### Deploying to Render
1. Sign in to [Render](https://render.com/).
2. Click **New** &rarr; **Web Service**.
3. Connect your GitHub repository.
4. Input the configuration details:
   - **Runtime**: `Node`
   - **Build Command**: `npm run build`
   - **Start Command**: `npm run start`
5. Expand the **Advanced** settings section, add the environment variables defined in your `.env.local` file, and click **Deploy Web Service**.

### Deploying to Vercel
1. Install Vercel CLI (`npm install -g vercel`) or sign in at [Vercel](https://vercel.com/).
2. Connect your GitHub repository.
3. Vercel will auto-detect Next.js. Add the 3 environment variables from `.env.local` to the Project Settings page.
4. Click **Deploy**.
