import Bus from "./bus";

/// The page size (4 KiB) for the virtual dram system.
export const PAGE_SIZE: number = 4096;

// Machine-level CSRs.
/// Machine status register.
export const MSTATUS: number = 0x300;
/// Machine exception delefation register.
export const MEDELEG: number = 0x302;
/// Machine interrupt delefation register.
export const MIDELEG: number = 0x303;
/// Machine interrupt-enable register.
export const MIE: number = 0x304;
/// Machine trap-handler base address.
export const MTVEC: number = 0x305;
/// Machine exception program counter.
export const MEPC: number = 0x341;
/// Machine trap cause.
export const MCAUSE: number = 0x342;
/// Machine bad address or instruction.
export const MTVAL: number = 0x343;
/// Machine interrupt pending.
export const MIP: number = 0x344;

// MIP fields.
export const MIP_SSIP: number = 1 << 1;
export const MIP_MSIP: number = 1 << 3;
export const MIP_STIP: number = 1 << 5;
export const MIP_MTIP: number = 1 << 7;
export const MIP_SEIP: number = 1 << 9;
export const MIP_MEIP: number = 1 << 11;

// Supervisor-level CSRs.
/// Supervisor status register.
export const SSTATUS: number = 0x100;
/// Supervisor interrupt-enable register.
export const SIE: number = 0x104;
/// Supervisor trap handler base address.
export const STVEC: number = 0x105;
/// Supervisor exception program counter.
export const SEPC: number = 0x141;
/// Supervisor trap cause.
export const SCAUSE: number = 0x142;
/// Supervisor bad address or instruction.
export const STVAL: number = 0x143;
/// Supervisor interrupt pending.
export const SIP: number = 0x144;
/// Supervisor address translation and protection.
export const SATP: number = 0x180;

/// The privileged mode.
export enum Mode {
	User = 0b00,
	Supervisor = 0b01,
	Machine = 0b11,
}

/// Access type that is used in the virtual address translation process. It decides which exception
/// should raises (InstructionPageFault, LoadPageFault or StoreAMOPageFault).
export enum AccessType {
	/// Raises the exception InstructionPageFault. It is used for an instruction fetch.
	Instruction,
	/// Raises the exception LoadPageFault.
	Load,
	/// Raises the exception StoreAMOPageFault.
	Store,
}

export default class Cpu {
	/// 32 32-bit integer registers.
	private registers: buffer;
	/// Program counter to hold the the DRAM address of the next instruction that would be executed.
	private programCounter: number = DRAM_BASE;
	/// The current privilege mode.
	private mode: Mode = Mode.Machine;
	/// System bus that transfers data between CPU and peripheral devices.
	private bus: Bus;
	/// Control and status registers. RISC-V ISA sets aside a 12-bit encoding space (csr[11:0]) for
	/// up to 4096 CSRs.
	private csrs: buffer = buffer.create(4 * 4096);
	/// SV39 paging flag.
	private enablePaging: boolean = false;
	/// physical page number (PPN) × PAGE_SIZE (4096).
	private pageTable: number = 0;

	public constructor(binary: buffer, diskImage: buffer) {
		this.registers = buffer.create(4 * 32);
		buffer.writeu32(this.registers, 4 * 3, DRAM_BASE + DRAM_SIZE);

		this.bus = new Bus(binary, diskImage);
	}

	public fetch(): number {
		// TODO: fetch the cpu instruction
		return 0;
	}
	// instruction will become a uint64_t when we support 64 bit
	public execute(instruction: number) {}
	public step() {
		// 1. fetch the current instruction
		// TODO: handle exceptions
		const instruction = this.fetch();

		// 2. add 4 to the programCounter for the next cycle
		this.programCounter += 4;

		// 3. exceute
		// TODO: handle exceptions
		this.execute(instruction);

		// 4. handle interrupts
		const interrupt = this.isInterrupted();
		if (interrupt) {
			this.takeTrap(interrupt);
		}
	}
}
