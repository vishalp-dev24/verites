/**
 * Billing Service
 * Stripe + Flexprice integration
 * Credit-based billing with tier management
 */

import Stripe from 'stripe';
import { prisma } from '../database/client.js';
import { semanticCache } from '../redis/client.js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2024-12-18.acacia',
});

interface BillingEvent {
  jobId: string;
  tenantId: string;
  mode: string;
  workersUsed: number;
  iterations: number;
  creditsUsed: number;
}

interface TierLimits {
  free: { requests: number; workers: number };
  developer: { requests: number; workers: number };
  pro: { requests: number; workers: number };
  enterprise: { requests: number; workers: number };
}

const TIER_LIMITS: TierLimits = {
  free: { requests: 3000, workers: 10 },
  developer: { requests: 50000, workers: 10 },
  pro: { requests: 200000, workers: 10 },
  enterprise: { requests: Infinity, workers: Infinity },
};

const MODE_COSTS: Record<string, number> = {
  lite: 1,     // 1 credit
  medium: 3,   // 3 credits
  deep: 10,    // 10 credits
};

export class BillingService {
  /**
   * Process billing event
   */
  async processEvent(event: BillingEvent): Promise<void> {
    // Deduct credits
    await prisma.tenant.update({
      where: { tenantId: event.tenantId },
      data: {
        creditsBalance: { decrement: event.creditsUsed },
        creditsUsed: { increment: event.creditsUsed },
      },
    });

    // Store billing event
    await prisma.billingEvent.create({
      data: {
        eventId: `evt_${Date.now()}_${event.tenantId}`,
        tenantId: event.tenantId,
        jobId: event.jobId,
        mode: event.mode,
        workersUsed: event.workersUsed,
        iterations: event.iterations,
        creditsUsed: event.creditsUsed,
      },
    });

    // Check if balance is low
    await this.checkBalance(event.tenantId);
  }

  /**
   * Calculate credits for a research job
   */
  calculateCredits(
    mode: string,
    workersUsed: number,
    iterations: number,
    sourceCount: number
  ): number {
    const baseCost = MODE_COSTS[mode] || MODE_COSTS.medium;
    const workerCost = workersUsed * 0.5;
    const iterationCost = (iterations - 1) * 2; // First iteration is free
    const sourceCost = Math.max(0, sourceCount - 20) * 0.1; // Over 20 sources costs extra

    return Math.ceil(baseCost + workerCost + iterationCost + sourceCost);
  }

  /**
   * Check if tenant has sufficient credits
   */
  async hasSufficientCredits(tenantId: string, estimatedCost: number): Promise<{
    allowed: boolean;
    currentBalance: number;
    estimatedCost: number;
    afterBalance: number;
  }> {
    const tenant = await prisma.tenant.findUnique({
      where: { tenantId },
    });

    if (!tenant) {
      return {
        allowed: false,
        currentBalance: 0,
        estimatedCost,
        afterBalance: -estimatedCost,
      };
    }

    const afterBalance = tenant.creditsBalance - estimatedCost;

    return {
      allowed: afterBalance >= 0,
      currentBalance: tenant.creditsBalance,
      estimatedCost,
      afterBalance,
    };
  }

  /**
   * Add credits to tenant
   */
  async addCredits(tenantId: string, amount: number): Promise<void> {
    await prisma.tenant.update({
      where: { tenantId },
      data: {
        creditsBalance: { increment: amount },
      },
    });
  }

  /**
   * Get usage stats
   */
  async getUsageStats(tenantId: string): Promise<{
    creditsUsed: number;
    creditsBalance: number;
    requestsThisMonth: number;
    tier: string;
  }> {
    const tenant = await prisma.tenant.findUnique({
      where: { tenantId },
    });

    if (!tenant) {
      throw new Error('Tenant not found');
    }

    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const events = await prisma.billingEvent.count({
      where: {
        tenantId,
        createdAt: { gte: monthStart },
      },
    });

    return {
      creditsUsed: tenant.creditsUsed,
      creditsBalance: tenant.creditsBalance,
      requestsThisMonth: events,
      tier: tenant.tier,
    };
  }

  /**
   * Check balance and send alerts
   */
  private async checkBalance(tenantId: string): Promise<void> {
    const tenant = await prisma.tenant.findUnique({
      where: { tenantId },
    });

    if (!tenant) return;

    const maxCredits = this.getMaxCreditsForTier(tenant.tier);
    const percentRemaining = tenant.creditsBalance / maxCredits;

    // Alert thresholds
    if (percentRemaining <= 0.1) {
      console.log(`[Billing] ALERT: ${tenantId} credit balance at ${percentRemaining * 100}%`);
      // TODO: Send email/notification
    } else if (percentRemaining <= 0.25) {
      console.log(`[Billing] WARNING: ${tenantId} credit balance at ${percentRemaining * 100}%`);
    }
  }

  /**
   * Get max credits for tier
   */
  private getMaxCreditsForTier(tier: string): number {
    const monthlyCredits: Record<string, number> = {
      free: 0,
      developer: 1000, // ~$10 worth
      pro: 5000, // ~$50 worth
      enterprise: 50000,
    };

    return monthlyCredits[tier] || 0;
  }

  /**
   * Create Stripe subscription
   */
  async createSubscription(
    tenantId: string,
    tier: string,
    paymentMethodId: string
  ): Promise<string> {
    const tenant = await prisma.tenant.findUnique({ where: { tenantId } });
    if (!tenant) throw new Error('Tenant not found');

    // Create or get customer
    let customerId = tenant.stripeCustomerId;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: tenant.email,
      });
      customerId = customer.id;

      await prisma.tenant.update({
        where: { tenantId },
        data: { stripeCustomerId: customerId },
      });
    }

    // Attach payment method
    await stripe.paymentMethods.attach(paymentMethodId, {
      customer: customerId,
    });

    // Create subscription
    const priceIds: Record<string, string> = {
      developer: process.env.STRIPE_DEVELOPER_PRICE_ID || '',
      pro: process.env.STRIPE_PRO_PRICE_ID || '',
    };

    const subscription = await stripe.subscriptions.create({
      customer: customerId,
      items: [{ price: priceIds[tier] }],
      default_payment_method: paymentMethodId,
    });

    await prisma.tenant.update({
      where: { tenantId },
      data: {
        stripeSubscriptionId: subscription.id,
        tier,
      },
    });

    return subscription.id;
  }

  /**
   * Handle Stripe webhook
   */
  async handleWebhook(event: Stripe.Event): Promise<void> {
    switch (event.type) {
      case 'invoice.payment_succeeded':
        await this.handlePaymentSucceeded(event.data.object as Stripe.Invoice);
        break;
      case 'invoice.payment_failed':
        await this.handlePaymentFailed(event.data.object as Stripe.Invoice);
        break;
      case 'customer.subscription.deleted':
        await this.handleSubscriptionCancelled(event.data.object as Stripe.Subscription);
        break;
    }
  }

  private async handlePaymentSucceeded(invoice: Stripe.Invoice): Promise<void> {
    // Add monthly credits
    const customerId = invoice.customer as string;
    const tenant = await prisma.tenant.findFirst({
      where: { stripeCustomerId: customerId },
    });

    if (tenant) {
      const credits = tenant.tier === 'developer' ? 1000 : tenant.tier === 'pro' ? 5000 : 0;
      await this.addCredits(tenant.tenantId, credits);
    }
  }

  private async handlePaymentFailed(invoice: Stripe.Invoice): Promise<void> {
    // Notify tenant
    console.log('[Billing] Payment failed:', invoice.id);
  }

  private async handleSubscriptionCancelled(subscription: Stripe.Subscription): Promise<void> {
    const tenant = await prisma.tenant.findFirst({
      where: { stripeSubscriptionId: subscription.id },
    });

    if (tenant) {
      await prisma.tenant.update({
        where: { tenantId: tenant.tenantId },
        data: { tier: 'free' },
      });
    }
  }

  /**
   * Get tier limits
   */
  getTierLimits(tier: keyof TierLimits): { requests: number; workers: number } {
    return TIER_LIMITS[tier];
  }
}

export const billingService = new BillingService();
