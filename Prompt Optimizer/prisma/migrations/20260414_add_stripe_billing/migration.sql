-- Add Stripe billing fields to Team
ALTER TABLE "Team" ADD COLUMN "stripeCustomerId" TEXT;
ALTER TABLE "Team" ADD COLUMN "subscriptionStatus" TEXT NOT NULL DEFAULT 'inactive';

-- Create index for faster lookups
CREATE INDEX "Team_stripeCustomerId_idx" ON "Team"("stripeCustomerId");
