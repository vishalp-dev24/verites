/**
 * Billing Service
 * Razorpay integration for Indian market
 * Credit-based billing with tier management
 */

import Razorpay from 'razorpay';
import * as crypto from 'crypto';
import { prisma } from '../database/client.js';
import { semanticCache } from '../redis/client.js';

let razorpay: Razorpay | null = null;

function getRazorpay(): Razorpay {
  if (!razorpay) {
    const keyId = process.env.RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;

    if (!keyId || !keySecret) {
      throw new Error('Razorpay keys not configured. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET');
    }

    razorpay = new Razorpay({ key_id: keyId, key_secret: keySecret });
  }
  return razorpay;
}

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

// Razorpay plan configs (in paise)
const RAZORPAY_PLANS: Record<string, { planId: string; amount: number; credits: number }> = {
  developer: {
    planId: process.env.RAZORPAY_DEVELOPER_PLAN_ID || 'developer_monthly',
    amount: 2900, // ₹29 (~₹999 INR)
    credits: 50000,
  },
  pro: {
    planId: process.env.RAZORPAY_PRO_PLAN_ID || 'pro_monthly',
    amount: 9900, // ₹99 (~₹2,999 INR)
    credits: 200000,
  },
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
      console.log(`[Billing] ALERT: ${tenantId} credit balance at ${Math.round(percentRemaining * 100)}%`);
      // TODO: Send email/notification via SES
    } else if (percentRemaining <= 0.25) {
      console.log(`[Billing] WARNING: ${tenantId} credit balance at ${Math.round(percentRemaining * 100)}%`);
    }
  }

  /**
   * Get max credits for tier
   */
  private getMaxCreditsForTier(tier: string): number {
    const monthlyCredits: Record<string, number> = {
      free: 0,
      developer: 1000, // ~₹10 worth
      pro: 5000, // ~₹50 worth
      enterprise: 50000,
    };

    return monthlyCredits[tier] || 0;
  }

  /**
   * Create Razorpay subscription
   */
  async createSubscription(
    tenantId: string,
    tier: string,
    name: string,
    contact: string
  ): Promise<{ subscriptionId: string; shortUrl: string }> {
    const tenant = await prisma.tenant.findUnique({ where: { tenantId } });
    if (!tenant) throw new Error('Tenant not found');

    // Create or get customer
    let customerId = tenant.razorpayCustomerId;
    if (!customerId) {
      const customer = await getRazorpay().customers.create({
        name: name || tenant.name,
        email: tenant.email,
        contact: contact,
        notes: {
          tenantId,
        },
      });
      customerId = customer.id;

      await prisma.tenant.update({
        where: { tenantId },
        data: { razorpayCustomerId: customerId },
      });
    }

    // Get plan details
    const plan = RAZORPAY_PLANS[tier];
    if (!plan) throw new Error('Invalid tier');

    // Create subscription
    const subscription = await getRazorpay().subscriptions.create({
      plan_id: plan.planId,
      total_count: 12, // Monthly for 1 year
      notes: {
        tenantId,
        tier,
        credits: plan.credits,
        customer_id: customerId,
      },
    } as any);

    await prisma.tenant.update({
      where: { tenantId },
      data: {
        razorpaySubscriptionId: (subscription as any).id,
        tier,
      },
    });

    // Create payment link for first payment
    const paymentLink = await getRazorpay().paymentLink.create({
      amount: plan.amount,
      currency: 'INR',
      description: `VerifAI ${tier} Plan Subscription`,
      customer: {
        email: tenant.email,
        contact: contact,
        name: name || tenant.name,
      } as any,
      notify: {
        email: true,
        sms: false,
      },
      notes: {
        tenantId,
        tier,
        subscriptionId: (subscription as any).id,
      },
      callback_url: `${process.env.DASHBOARD_URL || 'http://localhost:3000'}/billing/success`,
      callback_method: 'get',
    });

    return { subscriptionId: (subscription as any).id, shortUrl: (paymentLink as any).short_url };
  }

  /**
   * Handle Razorpay webhook for subscription payments
   */
  async handleWebhook(payload: unknown, signature: string): Promise<void> {
    // Verify webhook signature
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET || '';
    const expectedSignature = crypto
      .createHmac('sha256', webhookSecret)
      .update(JSON.stringify(payload))
      .digest('hex');

    if (expectedSignature !== signature) {
      throw new Error('Invalid webhook signature');
    }

    const event = payload as { event: string; payload?: { subscription?: { entity?: { notes?: { tenantId?: string; tier?: string; credits?: string } } } } };

    switch (event.event) {
      case 'subscription.charged':
        await this.handleRazorpayPayment(payload);
        break;
      case 'subscription.cancelled':
        await this.handleRazorpayCancellation(payload);
        break;
    }
  }

  private async handleRazorpayPayment(payload: unknown): Promise<void> {
    const data = payload as { payload?: { subscription?: { entity?: { notes?: { tenantId?: string; tier?: string; credits?: string } } } } };
    const notes = data.payload?.subscription?.entity?.notes;
    if (notes && notes.tenantId && notes.tier) {
      const plan = RAZORPAY_PLANS[notes.tier];
      if (plan) {
        await this.addCredits(notes.tenantId, plan.credits);
      }
    }
  }

  private async handleRazorpayCancellation(payload: unknown): Promise<void> {
    const data = payload as { payload?: { subscription?: { entity?: { id?: string } } } };
    const subscriptionId = data.payload?.subscription?.entity?.id;
    if (subscriptionId) {
      await prisma.tenant.updateMany({
        where: { razorpaySubscriptionId: subscriptionId },
        data: { tier: 'free' },
      });
    }
  }

  /**
   * Generate UPI payment link for quick top-ups
   */
  async createUPIPayment(
    tenantId: string, 
    amountRs: number, 
    credits: number
  ): Promise<{ shortUrl: string; orderId: string }> {
    const tenant = await prisma.tenant.findUnique({ where: { tenantId } });
    if (!tenant) throw new Error('Tenant not found');

    // Create order
    const order = await getRazorpay().orders.create({
      amount: amountRs * 100, // Convert to paise
      currency: 'INR',
      receipt: `credits_${tenantId}_${Date.now()}`,
      notes: { tenantId, credits: credits.toString() },
    } as any);

    // Create payment link
    const paymentLink = await getRazorpay().paymentLink.create({
      amount: amountRs * 100,
      currency: 'INR',
      description: `${credits} Research Credits - Instant Top-up`,
      customer: {
        email: tenant.email,
        name: tenant.name,
      } as any,
      notify: { email: true },
      notes: { tenantId, credits: credits.toString(), orderId: (order as any).id },
      callback_url: `${process.env.DASHBOARD_URL || 'http://localhost:3000'}/billing/topup-success`,
      callback_method: 'get',
    });

    return { shortUrl: (paymentLink as any).short_url, orderId: (order as any).id };
  }

  /**
   * Get tier limits
   */
  getTierLimits(tier: keyof TierLimits): { requests: number; workers: number } {
    return TIER_LIMITS[tier];
  }
}

export const billingService = new BillingService();
