/**
 * Billing Service - Razorpay Implementation
 * Credit management and Razorpay integration for India
 */

import Razorpay from 'razorpay';
import crypto from 'crypto';
import { prisma } from '../database/client.js';

// Lazy initialization - only create when keys are available
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

// Plan configurations for Razorpay
const PLAN_CONFIGS: Record<string, { amount: number; credits: number; interval: string }> = {
  'developer': {
    amount: 29 * 100, // ₹2,900 per month (₹999 + taxes roughly)
    credits: 50000,
    interval: 'monthly',
  },
  'pro': {
    amount: 99 * 100, // ₹9,900 per month (₹2,999 + taxes roughly)
    credits: 200000,
    interval: 'monthly',
  },
  'developer_yearly': {
    amount: 749 * 100, // ₹74,900 for annual (₹7,490 * 10 months)
    credits: 50000 * 12,
    interval: 'yearly',
  },
  'pro_yearly': {
    amount: 2249 * 100, // ₹224,900 for annual
    credits: 200000 * 12,
    interval: 'yearly',
  },
};

export class BillingService {
  async deductCredits(tenantId: string, jobId: string, credits: number) {
    // Update tenant credits
    await prisma.tenant.update({
      where: { tenantId },
      data: {
        creditsBalance: {
          decrement: credits,
        },
        creditsUsed: {
          increment: credits,
        },
      },
    });

    // Log the charge using BillingEvent model
    await prisma.billingEvent.create({
      data: {
        eventId: `evt_${Date.now()}_${tenantId.slice(0, 8)}`,
        jobId,
        tenantId,
        mode: 'research',
        workersUsed: 0,
        iterations: 0,
        creditsUsed: credits * 100,
      },
    });
  }

  async getBalance(tenantId: string): Promise<number> {
    const tenant = await prisma.tenant.findUnique({
      where: { tenantId },
    });
    return tenant?.creditsBalance || 0;
  }

  async getUsageStats(tenantId: string) {
    const tenant = await prisma.tenant.findUnique({
      where: { tenantId },
    });

    if (!tenant) throw new Error('Tenant not found');

    const thisMonthStart = new Date();
    thisMonthStart.setDate(1);
    thisMonthStart.setHours(0, 0, 0, 0);

    const jobsThisMonth = await prisma.researchJob.count({
      where: {
        tenantId,
        createdAt: { gte: thisMonthStart },
      },
    });

    const creditsUsedThisMonth = await prisma.billingEvent.aggregate({
      where: {
        tenantId,
        createdAt: { gte: thisMonthStart },
      },
      _sum: { creditsUsed: true },
    });

    return {
      credits_balance: tenant.creditsBalance,
      credits_used_this_month: Math.floor((creditsUsedThisMonth._sum.creditsUsed || 0) / 100),
      requests_this_month: jobsThisMonth,
      tier: tenant.tier,
      api_calls_per_month: tenant.maxRequestsPerMonth,
    };
  }

  /**
   * Create Razorpay subscription for a tier
   */
  async createSubscription(tenantId: string, tier: string, email: string, isYearly: boolean = false) {
    const planKey = isYearly ? `${tier}_yearly` : tier;
    const planConfig = PLAN_CONFIGS[planKey];

    if (!planConfig) {
      throw new Error(`Invalid tier: ${tier}`);
    }

    // Get or create Razorpay customer
    const tenant = await prisma.tenant.findUnique({
      where: { tenantId },
    });

    if (!tenant) throw new Error('Tenant not found');

    let customerId = tenant.razorpayCustomerId;

    if (!customerId) {
      const customer = await getRazorpay().customers.create({
        email,
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

    // Create plan if not exists (in production, you'd pre-create plans)
    const plan = await getRazorpay().plans.create({
      period: planConfig.interval === 'monthly' ? 'monthly' : 'yearly',
      interval: 1,
      item: {
        name: `Veritas ${tier.charAt(0).toUpperCase() + tier.slice(1)} ${isYearly ? 'Annual' : ''} Plan`,
        amount: planConfig.amount,
        currency: 'INR',
        description: `${planConfig.credits} research credits per month`,
      },
      notes: {
        tier,
        credits: planConfig.credits.toString(),
      },
    });

    // Create subscription
    const subscription = await getRazorpay().subscriptions.create({
      plan_id: plan.id,
      customer_id: customerId,
      total_count: planConfig.interval === 'monthly' ? 12 : 1, // 12 months for monthly, 1 year for yearly
      notes: {
        tenantId,
        tier,
      },
    });

    // Store subscription
    await prisma.tenant.update({
      where: { tenantId },
      data: {
        tier,
        razorpaySubscriptionId: subscription.id,
        // Credits added on first successful payment
      },
    });

    // Return payment link for first payment
    const paymentLink = await getRazorpay().paymentLink.create({
      amount: planConfig.amount,
      currency: 'INR',
      accept_partial: false,
      description: `VerifAI ${tier} Plan Subscription`,
      customer: {
        email,
      },
      notify: {
        email: true,
      },
      notes: {
        tenantId,
        tier,
        subscriptionId: subscription.id,
      },
      callback_url: `${process.env.DASHBOARD_URL || 'http://localhost:3000'}/billing/success`,
      callback_method: 'get',
    });

    return {
      subscriptionId: subscription.id,
      paymentLink: paymentLink.short_url,
      amount: planConfig.amount,
      currency: 'INR',
    };
  }

  /**
   * Verify Razorpay webhook signature
   */
  verifyWebhookSignature(body: string, signature: string): boolean {
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET || '';
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(body)
      .digest('hex');
    return expectedSignature === signature;
  }

  /**
   * Handle Razorpay webhooks
   */
  async handleWebhook(payload: any) {
    const event = payload.event || payload;

    switch (event) {
      case 'subscription.charged':
      case 'payment.captured': {
        const payment = payload.payload?.payment?.entity || payload;
        const notes = payment.notes || {};
        if (notes.tenantId && notes.tier) {
          await this.processSubscriptionPayment(notes.tenantId, notes.tier, notes.subscriptionId);
        }
        break;
      }
      case 'subscription.cancelled': {
        const subscription = payload.payload?.subscription?.entity;
        if (subscription) {
          await this.handleCancellation(subscription.id);
        }
        break;
      }
    }
  }

  private async processSubscriptionPayment(tenantId: string, tier: string, subscriptionId?: string) {
    const planConfig = PLAN_CONFIGS[tier] || PLAN_CONFIGS[`${tier}_yearly`];
    if (!planConfig) return;

    await prisma.tenant.update({
      where: { tenantId },
      data: {
        tier,
        creditsBalance: {
          increment: planConfig.credits,
        },
        ...(subscriptionId ? { razorpaySubscriptionId: subscriptionId } : {}),
      },
    });
  }

  private async handleCancellation(subscriptionId: string) {
    await prisma.tenant.updateMany({
      where: { razorpaySubscriptionId: subscriptionId },
      data: {
        tier: 'free',
      },
    });
  }

  /**
   * Generate UPI payment link for quick payments
   */
  async createUPIPayment(tenantId: string, amount: number, credits: number) {
    const tenant = await prisma.tenant.findUnique({
      where: { tenantId },
    });

    if (!tenant) throw new Error('Tenant not found');

    const order = await getRazorpay().orders.create({
      amount: amount * 100, // Convert to paise
      currency: 'INR',
      receipt: `credits_${tenantId}_${Date.now()}`,
      notes: {
        tenantId,
        credits: credits.toString(),
        type: 'credit_topup',
      },
    });

    return {
      orderId: order.id,
      amount: amount * 100,
      currency: 'INR',
    };
  }

  /**
   * Get GST invoice for Indian customers
   */
  async getGSTInvoice(tenantId: string, invoiceId: string) {
    try {
      const invoice = await getRazorpay().invoices.fetch(invoiceId);
      return invoice;
    } catch (error) {
      console.error('[Billing] Failed to fetch invoice:', error);
      return null;
    }
  }
}

export const billingService = new BillingService();
