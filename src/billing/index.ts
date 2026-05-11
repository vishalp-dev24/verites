/**
 * Billing Service
 * Razorpay integration for Indian market
 * Credit-based billing with tier management
 */

import Razorpay from 'razorpay';
import * as crypto from 'crypto';
import type { Prisma } from '@prisma/client';
import { prisma } from '../database/client.js';

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

interface CreditReservation {
  jobId: string;
  tenantId: string;
  mode: string;
  workersUsed: number;
  iterations: number;
  creditsReserved: number;
}

interface CreditReservationFinalization extends CreditReservation {
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
   * Reserve credits before paid work starts. This closes concurrent over-spend
   * where multiple jobs pass a read-only balance check before any deduction.
   */
  async reserveCredits(
    reservation: CreditReservation,
    tx: Prisma.TransactionClient = prisma
  ): Promise<void> {
    const creditsReserved = this.validatePositiveCreditAmount(
      reservation.creditsReserved,
      'creditsReserved'
    );

    const updated = await tx.tenant.updateMany({
      where: {
        tenantId: reservation.tenantId,
        creditsBalance: { gte: creditsReserved },
      },
      data: {
        creditsBalance: { decrement: creditsReserved },
      },
    });

    if (updated.count !== 1) {
      throw new Error('Insufficient credits');
    }
  }

  /**
   * Finalize an existing reservation with actual usage and refund unused
   * reserved credits. If actual usage exceeds the reservation, atomically debit
   * the difference before recording the event.
   */
  async finalizeCreditReservation(
    finalization: CreditReservationFinalization,
    tx?: Prisma.TransactionClient
  ): Promise<void> {
    if (tx) {
      await this.finalizeCreditReservationInTransaction(finalization, tx);
      return;
    }

    await prisma.$transaction(async (transaction) => {
      await this.finalizeCreditReservationInTransaction(finalization, transaction);
    });

    await this.checkBalance(finalization.tenantId);
  }

  private async finalizeCreditReservationInTransaction(
    finalization: CreditReservationFinalization,
    tx: Prisma.TransactionClient
  ): Promise<void> {
    const creditsReserved = this.validatePositiveCreditAmount(
      finalization.creditsReserved,
      'creditsReserved'
    );
    const creditsUsed = this.validatePositiveCreditAmount(finalization.creditsUsed, 'creditsUsed');
    const delta = creditsUsed - creditsReserved;

    const jobFinalization = await tx.researchJob.updateMany({
      where: {
        jobId: finalization.jobId,
        tenantId: finalization.tenantId,
        billingFinalizedAt: null,
        reservationReleasedAt: null,
      },
      data: {
        billingFinalizedAt: new Date(),
      },
    });

    if (jobFinalization.count !== 1) {
      return;
    }

    const eventCreate = await tx.billingEvent.createMany({
      data: [{
        eventId: `evt_${crypto.randomUUID()}`,
        tenantId: finalization.tenantId,
        jobId: finalization.jobId,
        mode: finalization.mode,
        workersUsed: finalization.workersUsed,
        iterations: finalization.iterations,
        creditsUsed,
      }],
      skipDuplicates: true,
    });

    if (eventCreate.count === 0) {
      return;
    }

    if (delta > 0) {
      const updated = await tx.tenant.updateMany({
        where: {
          tenantId: finalization.tenantId,
          creditsBalance: { gte: delta },
        },
        data: {
          creditsBalance: { decrement: delta },
          creditsUsed: { increment: creditsUsed },
        },
      });

      if (updated.count !== 1) {
        throw new Error('Insufficient credits');
      }
    } else {
      await tx.tenant.update({
        where: { tenantId: finalization.tenantId },
        data: {
          creditsBalance: { increment: Math.abs(delta) },
          creditsUsed: { increment: creditsUsed },
        },
      });
    }
  }

  async releaseCreditReservation(tenantId: string, creditsReserved: number): Promise<void> {
    const creditsToRelease = this.validatePositiveCreditAmount(creditsReserved, 'creditsReserved');

    await prisma.tenant.update({
      where: { tenantId },
      data: {
        creditsBalance: { increment: creditsToRelease },
      },
    });
  }

  async releaseCreditReservationForJob(
    jobId: string,
    tenantId: string,
    creditsReserved: number
  ): Promise<void> {
    const creditsToRelease = this.validatePositiveCreditAmount(creditsReserved, 'creditsReserved');

    await prisma.$transaction(async (tx) => {
      const release = await tx.researchJob.updateMany({
        where: {
          jobId,
          tenantId,
          billingFinalizedAt: null,
          reservationReleasedAt: null,
        },
        data: {
          reservationReleasedAt: new Date(),
        },
      });

      if (release.count !== 1) return;

      await tx.tenant.update({
        where: { tenantId },
        data: {
          creditsBalance: { increment: creditsToRelease },
        },
      });
    });
  }

  /**
   * Process billing event
   */
  async processEvent(event: BillingEvent): Promise<void> {
    const creditsUsed = this.validatePositiveCreditAmount(event.creditsUsed, 'creditsUsed');

    await prisma.$transaction(async (tx) => {
      const updated = await tx.tenant.updateMany({
        where: {
          tenantId: event.tenantId,
          creditsBalance: { gte: creditsUsed },
        },
        data: {
          creditsBalance: { decrement: creditsUsed },
          creditsUsed: { increment: creditsUsed },
        },
      });

      if (updated.count !== 1) {
        throw new Error('Insufficient credits');
      }

      await tx.billingEvent.create({
        data: {
          eventId: `evt_${crypto.randomUUID()}`,
          tenantId: event.tenantId,
          jobId: event.jobId,
          mode: event.mode,
          workersUsed: event.workersUsed,
          iterations: event.iterations,
          creditsUsed,
        },
      });
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
    const requestedCost = this.validatePositiveCreditAmount(estimatedCost, 'estimatedCost');
    const tenant = await prisma.tenant.findUnique({
      where: { tenantId },
    });

    if (!tenant) {
      return {
        allowed: false,
        currentBalance: 0,
        estimatedCost: requestedCost,
        afterBalance: -requestedCost,
      };
    }

    const afterBalance = tenant.creditsBalance - requestedCost;

    return {
      allowed: afterBalance >= 0,
      currentBalance: tenant.creditsBalance,
      estimatedCost: requestedCost,
      afterBalance,
    };
  }

  /**
   * Add credits to tenant
   */
  async addCredits(tenantId: string, amount: number): Promise<void> {
    const creditsToAdd = this.validatePositiveCreditAmount(amount, 'amount');

    await prisma.tenant.update({
      where: { tenantId },
      data: {
        creditsBalance: { increment: creditsToAdd },
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
      // Notification delivery is handled by the deployment's alerting integration.
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
      description: `Veritas ${tier} Plan Subscription`,
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
      callback_url: this.dashboardCallbackUrl('/billing/success'),
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
      callback_url: this.dashboardCallbackUrl('/billing/topup-success'),
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

  private validatePositiveCreditAmount(amount: number, fieldName: string): number {
    if (!Number.isFinite(amount)) {
      throw new Error(`${fieldName} must be finite`);
    }

    const credits = Math.ceil(amount);
    if (credits <= 0) {
      throw new Error(`${fieldName} must be positive`);
    }

    return credits;
  }

  private dashboardCallbackUrl(path: string): string {
    const dashboardUrl = process.env.DASHBOARD_URL;
    if (dashboardUrl) return `${dashboardUrl.replace(/\/$/, '')}${path}`;
    if (process.env.NODE_ENV === 'production') {
      throw new Error('DASHBOARD_URL is required for billing callbacks in production');
    }
    return `http://localhost:3000${path}`;
  }
}

export const billingService = new BillingService();
