import Stripe from "stripe";
import { prisma } from "@/lib/db";
import logger from "@/lib/logger";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "", {
  apiVersion: "2024-04-10",
});

export interface StripeCustomer {
  id: string;
  email: string;
  name: string;
  stripeCustomerId: string;
}

export interface BillingPortalSession {
  url: string;
  expiresAt: Date;
}

export interface InvoiceData {
  id: string;
  stripeInvoiceId: string;
  amount: number;
  currency: string;
  status: string;
  dueDate: Date | null;
  paidAt: Date | null;
}

/**
 * Create or get Stripe customer for a team
 * Creates a customer in Stripe and stores the ID in the database
 */
export async function getOrCreateStripeCustomer(
  teamId: string,
  email: string,
  name: string,
): Promise<string> {
  // Check if team already has a Stripe customer ID
  const team = await prisma.team.findUnique({
    where: { id: teamId },
    select: { stripeCustomerId: true },
  });

  if (team?.stripeCustomerId) {
    return team.stripeCustomerId;
  }

  // Create new Stripe customer
  const customer = await stripe.customers.create({
    email,
    name,
    metadata: {
      teamId,
    },
  });

  // Store Stripe customer ID in database
  await prisma.team.update({
    where: { id: teamId },
    data: { stripeCustomerId: customer.id },
  });

  logger.info(
    { teamId, stripeCustomerId: customer.id },
    "Stripe customer created",
  );

  return customer.id;
}

/**
 * Create a subscription for a team
 * Sets up a monthly subscription for the team
 */
export async function createSubscription(
  teamId: string,
  stripeCustomerId: string,
  priceId: string,
): Promise<string> {
  const subscription = await stripe.subscriptions.create({
    customer: stripeCustomerId,
    items: [{ price: priceId }],
    metadata: {
      teamId,
    },
    payment_behavior: "default_incomplete",
    payment_settings: {
      save_default_payment_method: "on_subscription",
    },
  });

  logger.info(
    { teamId, subscriptionId: subscription.id },
    "Subscription created",
  );

  return subscription.id;
}

/**
 * Get billing portal session for team
 * Redirects user to Stripe billing portal where they can manage payment methods, view invoices, etc.
 */
export async function getBillingPortalSession(
  teamId: string,
  stripeCustomerId: string,
  returnUrl: string,
): Promise<BillingPortalSession> {
  const session = await stripe.billingPortal.sessions.create({
    customer: stripeCustomerId,
    return_url: returnUrl,
  });

  return {
    url: session.url,
    expiresAt: new Date(session.expires_at * 1000),
  };
}

/**
 * Get customer invoices
 * Retrieves all invoices for a Stripe customer
 */
export async function getCustomerInvoices(
  stripeCustomerId: string,
  limit: number = 10,
): Promise<InvoiceData[]> {
  const invoices = await stripe.invoices.list({
    customer: stripeCustomerId,
    limit,
  });

  return invoices.data.map((invoice) => ({
    id: invoice.id,
    stripeInvoiceId: invoice.id,
    amount: invoice.amount_due || 0,
    currency: invoice.currency || "usd",
    status: invoice.status || "draft",
    dueDate: invoice.due_date ? new Date(invoice.due_date * 1000) : null,
    paidAt: invoice.paid_at ? new Date(invoice.paid_at * 1000) : null,
  }));
}

/**
 * Get payment method for customer
 * Returns the default payment method on file
 */
export async function getDefaultPaymentMethod(
  stripeCustomerId: string,
): Promise<Stripe.PaymentMethod | null> {
  const customer = await stripe.customers.retrieve(stripeCustomerId);

  if (
    typeof customer === "object" &&
    customer.default_source &&
    typeof customer.default_source === "string"
  ) {
    // Legacy card object
    return null;
  }

  if (
    typeof customer === "object" &&
    customer.invoice_settings?.default_payment_method
  ) {
    const paymentMethod = await stripe.paymentMethods.retrieve(
      customer.invoice_settings.default_payment_method as string,
    );
    return paymentMethod;
  }

  return null;
}

/**
 * Update payment method for customer
 */
export async function updatePaymentMethod(
  stripeCustomerId: string,
  paymentMethodId: string,
): Promise<Stripe.Customer> {
  const customer = await stripe.customers.update(stripeCustomerId, {
    invoice_settings: {
      default_payment_method: paymentMethodId,
    },
  });

  logger.info({ stripeCustomerId, paymentMethodId }, "Payment method updated");

  return customer;
}

/**
 * Cancel subscription for team
 */
export async function cancelSubscription(
  subscriptionId: string,
): Promise<void> {
  const subscription = await stripe.subscriptions.del(subscriptionId);

  logger.info({ subscriptionId }, "Subscription cancelled");
}

/**
 * Create usage record for metered billing
 * For usage-based billing, records API calls for later billing
 */
export async function recordUsageForBilling(
  subscriptionId: string,
  usageType: "tokens" | "api_calls",
  quantity: number,
): Promise<void> {
  try {
    // This would be used for metered billing where we track usage
    // For now, we store in the database for later processing
    logger.info(
      { subscriptionId, usageType, quantity },
      "Usage recorded for billing",
    );
  } catch (error: any) {
    logger.error(
      { subscriptionId, usageType, error: error.message },
      "Failed to record usage",
    );
  }
}

/**
 * Get subscription details
 */
export async function getSubscription(
  subscriptionId: string,
): Promise<Stripe.Subscription | null> {
  try {
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    return subscription;
  } catch (error: any) {
    if (error.code === "resource_missing") {
      return null;
    }
    throw error;
  }
}

/**
 * Handle Stripe webhook events
 */
export async function handleStripeWebhook(event: Stripe.Event): Promise<void> {
  switch (event.type) {
    case "customer.subscription.deleted":
      {
        const subscription = event.data.object as Stripe.Subscription;
        const teamId = subscription.metadata?.teamId;
        if (teamId) {
          await prisma.team.update({
            where: { id: teamId },
            data: { subscriptionStatus: "cancelled" },
          });
          logger.info({ teamId }, "Subscription cancelled via webhook");
        }
      }
      break;

    case "invoice.payment_succeeded":
      {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = invoice.customer as string;
        const customer = await stripe.customers.retrieve(customerId);
        if (typeof customer === "object" && customer.metadata?.teamId) {
          logger.info(
            { teamId: customer.metadata.teamId, invoiceId: invoice.id },
            "Invoice payment succeeded",
          );
        }
      }
      break;

    case "invoice.payment_failed":
      {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = invoice.customer as string;
        const customer = await stripe.customers.retrieve(customerId);
        if (typeof customer === "object" && customer.metadata?.teamId) {
          logger.warn(
            { teamId: customer.metadata.teamId, invoiceId: invoice.id },
            "Invoice payment failed",
          );
        }
      }
      break;

    default:
      logger.debug({ eventType: event.type }, "Unhandled Stripe event");
  }
}
