//! The plic module contains the platform-level interrupt controller (PLIC).
//! The plic connects all external interrupts in the system to all hart
//! contexts in the system, via the external interrupt source in each hart.
//! It's the global interrupt controller in a RISC-V system.

/// The address of interrupt pending bits.
export const PLIC_PENDING: number = PLIC_BASE + 0x1000;
/// The address of the regsiters to enable interrupts for S-mode.
export const PLIC_SENABLE: number = PLIC_BASE + 0x2080;
/// The address of the registers to set a priority for S-mode.
export const PLIC_SPRIORITY: number = PLIC_BASE + 0x201000;
/// The address of the claim/complete registers for S-mode.
export const PLIC_SCLAIM: number = PLIC_BASE + 0x201004;

export default class Plic {
	// TODO: Implement the rest of https://github.com/d0iasm/rvemu-for-book/blob/main/step10/src/plic.rs
	public constructor() {}
}
