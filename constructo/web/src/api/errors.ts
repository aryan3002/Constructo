// Shared error classes for the Constructo API layer.
// Kept in a leaf module (no imports from this repo) so any API file
// can import without creating circular dependencies.

/** Thrown when the server returns 403 `step_up_required`.
 *
 * Callers that catch this should prompt for a fresh OTP, call
 * `authApi.stepUpVerify(otp)` to exchange it for a short-lived token,
 * then retry the sensitive operation with that token in `X-Step-Up-Token`.
 */
export class StepUpRequiredError extends Error {
  constructor() {
    super('step_up_required')
    this.name = 'StepUpRequiredError'
  }
}
