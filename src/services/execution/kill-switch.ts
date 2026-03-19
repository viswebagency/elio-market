/**
 * Kill switch — emergency stop for all trading operations.
 * When activated, blocks all new trades and optionally closes open positions.
 */

export class KillSwitch {
  private active = false;
  private activatedAt: string | null = null;
  private activatedBy: string | null = null;
  private reason: string | null = null;

  /** Check if kill switch is active */
  isActive(): boolean {
    return this.active;
  }

  /** Activate the kill switch */
  activate(userId: string, reason: string): void {
    this.active = true;
    this.activatedAt = new Date().toISOString();
    this.activatedBy = userId;
    this.reason = reason;

    console.error(`[KILL SWITCH] ACTIVATED by ${userId}: ${reason}`);
    // TODO: send notifications to all channels
    // TODO: cancel all pending orders
    // TODO: optionally close all positions
  }

  /** Deactivate the kill switch */
  deactivate(userId: string): void {
    console.log(`[KILL SWITCH] Deactivated by ${userId}`);
    this.active = false;
    this.activatedAt = null;
    this.activatedBy = null;
    this.reason = null;
  }

  /** Get current status */
  getStatus(): KillSwitchStatus {
    return {
      active: this.active,
      activatedAt: this.activatedAt,
      activatedBy: this.activatedBy,
      reason: this.reason,
    };
  }
}

export interface KillSwitchStatus {
  active: boolean;
  activatedAt: string | null;
  activatedBy: string | null;
  reason: string | null;
}

export const killSwitch = new KillSwitch();
