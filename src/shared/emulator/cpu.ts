import Bus, { DRAM_BASE } from "./bus";
import { DRAM_SIZE } from "./dram";
import { DESC_NUM, VRING_DESC_SIZE } from "./virtio";

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

	/// Access the disk via virtio. This is a function to read and write with a dram directly (DMA).
	public disk_access() {
		// See more information in
		// https://github.com/mit-pdos/xv6-riscv/blob/riscv/kernel/virtio_disk.c

		// the spec says that legacy block operations use three
		// descriptors: one for type/reserved/sector, one for
		// the data, one for a 1-byte status result.

		// desc = pages -- num * VRingDesc
		// avail = pages + 0x40 -- 2 * uint16, then num * uint16
		// used = pages + 4096 -- 2 * uint16, then num * vRingUsedElem
		let desc_addr = this.bus.virtio.desc_addr();
		let avail_addr = this.bus.virtio.desc_addr() + 0x40;
		let used_addr = this.bus.virtio.desc_addr() + 4096;

		// avail[0] is flags
		// avail[1] tells the device how far to look in avail[2...].
		let offset = this.bus.load(avail_addr + 1, 16);
		// avail[2...] are desc[] indices the device should process.
		// we only tell device the first index in our chain of descriptors.
		let index = this.bus.load(avail_addr + (offset % DESC_NUM) + 2, 16);

		// Read `VRingDesc`, virtio descriptors.
		let desc_addr0 = desc_addr + VRING_DESC_SIZE * index;
		let addr0 = this.bus.load(desc_addr0, 64);
		// Add 14 because of `VRingDesc` structure.
		// struct VRingDesc {
		//   uint64 addr;
		//   uint32 len;
		//   uint16 flags;
		//   uint16 next
		// };
		// The `next` field can be accessed by offset 14 (8 + 4 + 2) bytes.
		let next0 = this.bus.load(desc_addr0 + 14, 16);

		// Read `VRingDesc` again, virtio descriptors.
		let desc_addr1 = desc_addr + VRING_DESC_SIZE * next0;
		let addr1 = this.bus.load(desc_addr1, 64);
		let len1 = this.bus.load(desc_addr1 + 8, 32);
		let flags1 = this.bus.load(desc_addr1 + 12, 16);
		// Read `virtio_blk_outhdr`. Add 8 because of its structure.
		// struct virtio_blk_outhdr {
		//   uint32 type;
		//   uint32 reserved;
		//   uint64 sector;
		// } buf0;
		let blk_sector = this.bus.load(addr0 + 8, 64);
		// Write to a device if the second bit `flag1` is set.
		if ((flags1 & 2) == 0) {
			// Read dram data and write it to a disk directly (DMA).
			// for i in 0..len1 as u64 {
			//     let data = cpu
			//         .bus
			//         .load(addr1 + i, 8)
			//         .expect("failed to read from dram");
			//     cpu.bus.virtio.write_disk(blk_sector * 512 + i, data);
			// }
			for (let i = 0; i < len1; i++) {
				let data = this.bus.load(addr1 + i, 8);
				this.bus.virtio.write_disk(blk_sector * 512 + i, data);
			}
		} else {
			// Read disk data and write it to dram directly (DMA).
			// for i in 0..len1 as u64 {
			//     let data = cpu.bus.virtio.read_disk(blk_sector * 512 + i);
			//     cpu.bus
			//         .store(addr1 + i, 8, data)
			//         .expect("failed to write to dram");
			// }
			for (let i = 0; i < len1; i++) {
				let data = this.bus.virtio.read_disk(blk_sector * 512 + i);
				this.bus.store(addr1 + i, 8, data);
			}
		}

		// Write id to `UsedArea`. Add 2 because of its structure.
		// struct UsedArea {
		//   uint16 flags;
		//   uint16 id;
		//   struct VRingUsedElem elems[NUM];
		// };
		let new_id = this.bus.virtio.get_new_id();
		this.bus.store(used_addr + 2, 16, new_id % 8);
	}

	public take_trap_helper(cause: number, isInterrupt: boolean) {
		let exceptionProgramCounter = this.programCounter - 4;
		let previousMode = this.mode;

		// Set an interrupt bit if a trap is an interrupt.
		if (isInterrupt) {
			cause = (1 << 63) | cause;
		}
		if (previousMode <= Mode.Supervisor && (this.load_csr(MEDELEG).wrapping_shr(cause) & 1) != 0) {
			// Handle the trap in S-mode.
			this.mode = Mode.Supervisor;

			// Set the program counter to the supervisor trap-handler base address (stvec).
			if (isInterrupt) {
				let vector;
				if ((this.load_csr(STVEC) & 1) === 1) {
					vector = 4 * cause;
				} else {
					vector = 0;
				}
				this.programCounter = (this.load_csr(STVEC) & bit32.bnot(1)) + vector;
			} else {
				this.programCounter = this.load_csr(STVEC) & bit32.bnot(1);
			}

			// 4.1.9 Supervisor Exception Program Counter (sepc)
			// "The low bit of sepc (sepc[0]) is always zero."
			// "When a trap is taken into S-mode, sepc is written with the virtual address of
			// the instruction that was interrupted or that encountered the exception.
			// Otherwise, sepc is never written by the implementation, though it may be
			// explicitly written by software."
			this.store_csr(SEPC, exceptionProgramCounter & bit32.bnot(1));

			// 4.1.10 Supervisor Cause Register (scause)
			// "When a trap is taken into S-mode, scause is written with a code indicating
			// the event that caused the trap.  Otherwise, scause is never written by the
			// implementation, though it may be explicitly written by software."
			this.store_csr(SCAUSE, cause);

			// 4.1.11 Supervisor Trap Value (stval) Register
			// "When a trap is taken into S-mode, stval is written with exception-specific
			// information to assist software in handling the trap. Otherwise, stval is never
			// written by the implementation, though it may be explicitly written by software."
			// "When a hardware breakpoint is triggered, or an instruction-fetch, load, or
			// store address-misaligned, access, or page-fault exception occurs, stval is
			// written with the faulting virtual address. On an illegal instruction trap,
			// stval may be written with the first XLEN or ILEN bits of the faulting
			// instruction as described below. For other exceptions, stval is set to zero."
			this.store_csr(STVAL, 0);

			// Set a previous interrupt-enable bit for supervisor mode (SPIE, 5) to the value
			// of a global interrupt-enable bit for supervisor mode (SIE, 1).
			let new_status;
			if (((this.load_csr(SSTATUS) >> 1) & 1) === 1) {
				new_status = this.load_csr(SSTATUS) | (1 << 5);
			} else {
				new_status = this.load_csr(SSTATUS) & bit32.bnot(1 << 5);
			}
			this.store_csr(SSTATUS, new_status);
			// Set a global interrupt-enable bit for supervisor mode (SIE, 1) to 0.
			this.store_csr(SSTATUS, this.load_csr(SSTATUS) & bit32.bnot(1 << 1));
			// 4.1.1 Supervisor Status Register (sstatus)
			// "When a trap is taken, SPP is set to 0 if the trap originated from user mode, or
			// 1 otherwise."
			switch (previousMode) {
				case Mode.User:
					this.store_csr(SSTATUS, this.load_csr(SSTATUS) & bit32.bnot(1 << 8));
					break;
				default:
					this.store_csr(SSTATUS, this.load_csr(SSTATUS) | (1 << 8));
					break;
			}
		} else {
			// Handle the trap in M-mode.
			this.mode = Mode.Machine;

			// Set the program counter to the machine trap-handler base address (mtvec).
			if (isInterrupt) {
				let vector;
				if ((this.load_csr(MTVEC) & 1) === 1) {
					vector = 4 * cause;
				} else {
					vector = 0;
				}

				this.programCounter = (this.load_csr(MTVEC) & bit32.bnot(1)) + vector;
			} else {
				this.programCounter = this.load_csr(MTVEC) & bit32.bnot(1);
			}

			// 3.1.15 Machine Exception Program Counter (mepc)
			// "The low bit of mepc (mepc[0]) is always zero."
			// "When a trap is taken into M-mode, mepc is written with the virtual address of
			// the instruction that was interrupted or that encountered the exception.
			// Otherwise, mepc is never written by the implementation, though it may be
			// explicitly written by software."
			this.store_csr(MEPC, exceptionProgramCounter & bit32.bnot(1));

			// 3.1.16 Machine Cause Register (mcause)
			// "When a trap is taken into M-mode, mcause is written with a code indicating
			// the event that caused the trap. Otherwise, mcause is never written by the
			// implementation, though it may be explicitly written by software."
			this.store_csr(MCAUSE, cause);

			// 3.1.17 Machine Trap Value (mtval) Register
			// "When a trap is taken into M-mode, mtval is either set to zero or written with
			// exception-specific information to assist software in handling the trap.
			// Otherwise, mtval is never written by the implementation, though it may be
			// explicitly written by software."
			// "When a hardware breakpoint is triggered, or an instruction-fetch, load, or
			// store address-misaligned, access, or page-fault exception occurs, mtval is
			// written with the faulting virtual address. On an illegal instruction trap,
			// mtval may be written with the first XLEN or ILEN bits of the faulting
			// instruction as described below. For other traps, mtval is set to zero."
			this.store_csr(MTVAL, 0);

			// Set a previous interrupt-enable bit for supervisor mode (MPIE, 7) to the value
			// of a global interrupt-enable bit for supervisor mode (MIE, 3).
			let new_status;
			if (((this.load_csr(MSTATUS) >> 3) & 1) === 1) {
				new_status = this.load_csr(MSTATUS) | (1 << 7);
			} else {
				new_status = this.load_csr(MSTATUS) & bit32.bnot(1 << 7);
			}
			this.store_csr(MSTATUS, new_status);
			// Set a global interrupt-enable bit for supervisor mode (MIE, 3) to 0.
			this.store_csr(MSTATUS, this.load_csr(MSTATUS) & bit32.bnot(1 << 3));
			// Set a previous privilege mode for supervisor mode (MPP, 11..13) to 0.
			this.store_csr(MSTATUS, this.load_csr(MSTATUS) & bit32.bnot(0b11 << 11));
		}
	}
}

// TODO: finish cpu, implement csrs, etc
// TODO: https://github.com/d0iasm/rvemu-for-book/blob/main/step10/src/cpu.rs
