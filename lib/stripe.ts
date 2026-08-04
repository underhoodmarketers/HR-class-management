import Stripe from "stripe";

const key = process.env.STRIPE_SECRET_KEY;

// Instantiated lazily so the app can boot without Stripe configured yet.
export const stripe = new Stripe(key || "sk_test_placeholder", {
  apiVersion: "2024-06-20",
});

export function stripeConfigured() {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}
