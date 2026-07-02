/**
 * Payment Verification Service
 *
 * Defines the abstract interface and mock implementation for verifying blockchain transactions.
 * Decouples the frontend billing actions and Supabase database writes from specific node api providers
 * (e.g. Tatum, Nownodes, TronGrid, Etherscan).
 */

export interface VerificationResult {
  success: boolean;
  confirmed: boolean;
  actualAmount?: number;
  txTime?: Date;
  error?: string;
}

export interface PaymentVerificationProvider {
  name: string;
  verifyTransaction(
    txnHash: string,
    network: string,
    expectedAmount: number,
    targetAddress: string
  ): Promise<VerificationResult>;
}

/**
 * Mock payment verification provider for development and testing.
 * Automatically accepts any valid-looking transaction hash to simulate success,
 * making end-to-end sandbox verification extremely easy.
 */
export class MockPaymentVerificationProvider implements PaymentVerificationProvider {
  name = 'MockProvider';

  async verifyTransaction(
    txnHash: string,
    network: string,
    expectedAmount: number,
    targetAddress: string
  ): Promise<VerificationResult> {
    // Simulate network delay
    await new Promise((resolve) => setTimeout(resolve, 1500));

    const trimmed = txnHash.trim();

    if (!trimmed || trimmed.length < 8) {
      return {
        success: false,
        confirmed: false,
        error: 'Invalid transaction hash format. Must be at least 8 characters.',
      };
    }

    // Fail case simulation for special query hashes to test error handling
    if (trimmed.toLowerCase().includes('fail') || trimmed.toLowerCase().includes('reject')) {
      return {
        success: false,
        confirmed: false,
        error: 'Transaction hash was rejected by blockchain nodes.',
      };
    }

    // Success response returning the full expected amount
    return {
      success: true,
      confirmed: true,
      actualAmount: expectedAmount,
      txTime: new Date(),
    };
  }
}

/**
 * Service orchestrator that handles delegating verification tasks.
 * If external integrations (e.g. Tatum or Nownodes) are added in the future,
 * they can be registered here based on configuration parameters without touching
 * page views or databases.
 */
export class PaymentVerificationService {
  private static provider: PaymentVerificationProvider = new MockPaymentVerificationProvider();

  /**
   * Override provider if a different node scanner is selected.
   */
  public static setProvider(newProvider: PaymentVerificationProvider) {
    this.provider = newProvider;
  }

  public static async verify(
    txnHash: string,
    network: string,
    expectedAmount: number,
    targetAddress: string
  ): Promise<VerificationResult> {
    try {
      return await this.provider.verifyTransaction(txnHash, network, expectedAmount, targetAddress);
    } catch (err: any) {
      return {
        success: false,
        confirmed: false,
        error: err.message || 'Unexpected verification failure',
      };
    }
  }
}
