import Bus, { DRAM_BASE } from "./bus";
import { DRAM_SIZE } from "./dram";
import { PLIC_SCLAIM } from "./plic";
import {
	Exception,
	InstructionAccessFault,
	InstructionPageFault,
	Interrupt,
	LoadPageFault,
	MachineExternalInterrupt,
	MachineSoftwareInterrupt,
	MachineTimerInterrupt,
	StoreAMOPageFault,
	SupervisorExternalInterrupt,
	SupervisorSoftwareInterrupt,
	SupervisorTimerInterrupt,
	Trap,
} from "./trap";
import { UART_IRQ } from "./uart";
import { DESC_NUM, VIRTIO_IRQ, VRING_DESC_SIZE } from "./virtio";

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
	/// https://riscv.org/wp-content/uploads/2017/05/riscv-spec-v2.2.pdf: 2.8 CSRS
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

	public checkPendingInterrupt(): Interrupt | undefined {
		// 3.1.6.1 Privilege and Global Interrupt-Enable Stack in mstatus register
		// "When a hart is executing in privilege mode x, interrupts are globally enabled when x
		// IE=1 and globally disabled when x IE=0."
		switch (this.mode) {
			case Mode.Machine: {
				// Check if the MIE bit is enabled.
				if (((this.load_csr(MSTATUS) >> 3) & 1) === 0) {
					return undefined;
				}
			}
			case Mode.Supervisor: {
				// Check if the SIE bit is enabled.
				if (((this.load_csr(SSTATUS) >> 1) & 1) === 0) {
					return undefined;
				}
			}
			default:
				break;
		}

		// Check external interrupt for uart and virtio.
		let irq;
		if (this.bus.uart.isInterrupting()) {
			irq = UART_IRQ;
		} else if (this.bus.virtio.isInterrupting()) {
			// Access disk by direct dram access (DMA). An interrupt is raised after a disk
			// access is done.
			this.diskAccess();
			irq = VIRTIO_IRQ;
		} else {
			irq = 0;
		}

		if (irq !== 0) {
			this.bus.store(PLIC_SCLAIM, 32, irq);
			this.store_csr(MIP, this.load_csr(MIP) | MIP_SEIP);
		}

		// "An interrupt i will be taken if bit i is set in both mip and mie, and if interrupts are globally enabled.
		// By default, M-mode interrupts are globally enabled if the hart’s current privilege mode is less than
		// M, or if the current privilege mode is M and the MIE bit in the mstatus register is set. If bit i
		// in mideleg is set, however, interrupts are considered to be globally enabled if the hart’s current
		// privilege mode equals the delegated privilege mode (S or U) and that mode’s interrupt enable bit
		// (SIE or UIE in mstatus) is set, or if the current privilege mode is less than the delegated privilege
		// mode."

		let pending = this.load_csr(MIE) & this.load_csr(MIP);

		if ((pending & MIP_MEIP) !== 0) {
			this.store_csr(MIP, this.load_csr(MIP) & bit32.bnot(MIP_MEIP));
			return new MachineExternalInterrupt();
		}
		if ((pending & MIP_MSIP) !== 0) {
			this.store_csr(MIP, this.load_csr(MIP) & bit32.bnot(MIP_MSIP));
			return new MachineSoftwareInterrupt();
		}
		if ((pending & MIP_MTIP) !== 0) {
			this.store_csr(MIP, this.load_csr(MIP) & bit32.bnot(MIP_MTIP));
			return new MachineTimerInterrupt();
		}
		if ((pending & MIP_SEIP) !== 0) {
			this.store_csr(MIP, this.load_csr(MIP) & bit32.bnot(MIP_SEIP));
			return new SupervisorExternalInterrupt();
		}
		if ((pending & MIP_SSIP) !== 0) {
			this.store_csr(MIP, this.load_csr(MIP) & bit32.bnot(MIP_SSIP));
			return new SupervisorSoftwareInterrupt();
		}
		if ((pending & MIP_STIP) !== 0) {
			this.store_csr(MIP, this.load_csr(MIP) & bit32.bnot(MIP_STIP));
			return new SupervisorTimerInterrupt();
		}

		return undefined;
	}

	/// Update the physical page number (PPN) and the addressing mode.
	public update_paging(csrAddress: number) {
		if (csrAddress != SATP) {
			return;
		}

		// Read the physical page number (PPN) of the root page table, i.e., its
		// supervisor physical address divided by 4 KiB.
		this.pageTable = (this.load_csr(SATP) & ((1 << 44) - 1)) * PAGE_SIZE;

		// Read the MODE field, which selects the current address-translation scheme.
		const mode = this.load_csr(SATP) >> 60;

		// Enable the SV39 paging if the value of the mode field is 8.
		if (mode === 8) {
			this.enablePaging = true;
		} else {
			this.enablePaging = false;
		}
	}

	/// Translate a virtual address to a physical address for the paged virtual-dram system.
	public translate(address: number, accessType: AccessType): number {
		if (!this.enablePaging) {
			return address;
		}

		// The following comments are cited from 4.3.2 Virtual Address Translation Process
		// in "The RISC-V Instruction Set Manual Volume II-Privileged Architecture_20190608".

		// "A virtual address va is translated into a physical address pa as follows:"
		let levels = 3;
		let vpn = [(address >> 12) & 0x1ff, (address >> 21) & 0x1ff, (address >> 30) & 0x1ff];

		// "1. Let a be satp.ppn × PAGESIZE, and let i = LEVELS − 1. (For Sv32, PAGESIZE=212
		//     and LEVELS=2.)"
		let a = this.pageTable;
		let i: number = levels - 1;
		let pte;
		while (true) {
			// "2. Let pte be the value of the PTE at address a+va.vpn[i]×PTESIZE. (For Sv32,
			//     PTESIZE=4.) If accessing pte violates a PMA or PMP check, raise an access
			//     exception corresponding to the original access type."
			pte = this.bus.load(a + vpn[i] * 8, 64);

			// "3. If pte.v = 0, or if pte.r = 0 and pte.w = 1, stop and raise a page-fault
			//     exception corresponding to the original access type."
			let v = pte & 1;
			let r = (pte >> 1) & 1;
			let w = (pte >> 2) & 1;
			let x = (pte >> 3) & 1;
			if (v === 0 || (r === 0 && w === 1)) {
				switch (accessType) {
					case AccessType.Instruction:
						throw new InstructionPageFault();
					case AccessType.Load:
						throw new LoadPageFault();
					case AccessType.Store:
						throw new StoreAMOPageFault();
				}
			}

			// "4. Otherwise, the PTE is valid. If pte.r = 1 or pte.x = 1, go to step 5.
			//     Otherwise, this PTE is a pointer to the next level of the page table.
			//     Let i = i − 1. If i < 0, stop and raise a page-fault exception
			//     corresponding to the original access type. Otherwise,
			//     let a = pte.ppn × PAGESIZE and go to step 2."
			if (r === 1 || x === 1) {
				break;
			}
			i -= 1;
			let ppn = (pte >> 10) & 0x0fff_ffff_ffff;
			a = ppn * PAGE_SIZE;
			if (i < 0) {
				switch (accessType) {
					case AccessType.Instruction:
						throw new InstructionPageFault();
					case AccessType.Load:
						throw new LoadPageFault();
					case AccessType.Store:
						throw new StoreAMOPageFault();
				}
			}
		}

		// A leaf PTE has been found.
		const ppn = [(pte >> 10) & 0x1ff, (pte >> 19) & 0x1ff, (pte >> 28) & 0x03ff_ffff];

		// We skip implementing from step 5 to 7.

		// "5. A leaf PTE has been found. Determine if the requested dram access is allowed by
		//     the pte.r, pte.w, pte.x, and pte.u bits, given the current privilege mode and the
		//     value of the SUM and MXR fields of the mstatus register. If not, stop and raise a
		//     page-fault exception corresponding to the original access type."

		// "6. If i > 0 and pte.ppn[i − 1 : 0] ̸= 0, this is a misaligned superpage; stop and
		//     raise a page-fault exception corresponding to the original access type."

		// "7. If pte.a = 0, or if the dram access is a store and pte.d = 0, either raise a
		//     page-fault exception corresponding to the original access type, or:
		//     • Set pte.a to 1 and, if the dram access is a store, also set pte.d to 1.
		//     • If this access violates a PMA or PMP check, raise an access exception
		//     corresponding to the original access type.
		//     • This update and the loading of pte in step 2 must be atomic; in particular, no
		//     intervening store to the PTE may be perceived to have occurred in-between."

		// "8. The translation is successful. The translated physical address is given as
		//     follows:
		//     • pa.pgoff = va.pgoff.
		//     • If i > 0, then this is a superpage translation and pa.ppn[i−1:0] =
		//     va.vpn[i−1:0].
		//     • pa.ppn[LEVELS−1:i] = pte.ppn[LEVELS−1:i]."
		let offset = address & 0xfff;
		switch (i) {
			case 0:
				// a is ppn
				let a = (pte >> 10) & 0x0fff_ffff_ffff;
				return (a << 12) | offset;
			case 1: {
				// Superpage translation. A superpage is a dram page of larger size than an
				// ordinary page (4 KiB). It reduces TLB misses and improves performance.
				return (ppn[2] << 30) | (ppn[1] << 21) | (vpn[0] << 12) | offset;
			}
			case 2: {
				// Superpage translation. A superpage is a dram page of larger size than an
				// ordinary page (4 KiB). It reduces TLB misses and improves performance.
				return (ppn[2] << 30) | (vpn[1] << 21) | (vpn[0] << 12) | offset;
			}
			default: {
				switch (accessType) {
					case AccessType.Instruction:
						throw new InstructionPageFault();
					case AccessType.Load:
						throw new LoadPageFault();
					case AccessType.Store:
						throw new StoreAMOPageFault();
				}
			}
		}
	}

	/// Load a value from a CSR.
	public load_csr(address: number): number {
		switch (address) {
			case SIE:
				return buffer.readu32(this.csrs, MIE) & buffer.readu32(this.csrs, MIDELEG);
			default:
				return buffer.readu32(this.csrs, address);
		}
	}

	/// Store a value to a CSR.
	public store_csr(address: number, value: number) {
		switch (address) {
			case SIE:
				buffer.writeu32(
					this.csrs,
					MIE,
					(buffer.readu32(this.csrs, MIE) & bit32.bnot(buffer.readu32(this.csrs, MIDELEG))) |
						(value & buffer.readu32(this.csrs, MIDELEG)),
				);
				break;
			default:
				buffer.writeu32(this.csrs, address, value);
				break;
		}
	}

	/// Load a value from a dram.
	public load(address: number, size: number): number {
		let p_addr = this.translate(address, AccessType.Load);
		return this.bus.load(p_addr, size);
	}

	/// Store a value to a dram.
	public store(address: number, size: number, value: number) {
		const p_addr = this.translate(address, AccessType.Store);
		this.bus.store(p_addr, size, value);
	}

	public fetch(): number {
		const p_pc = this.translate(this.programCounter, AccessType.Instruction);
		try {
			return this.bus.load(p_pc, 32);
		} catch (e: unknown) {
			throw new InstructionAccessFault();
		}
	}
	// instruction will become a uint64_t when we support 64 bit
	public execute(instruction: number) {
		// TODO: implement execute
	}
	// returns a boolean indicating whether the control flow should continue
	public step() {
		// 1. fetch the current instruction
		// TODO: handle exceptions
		const instruction = this.fetch();

		// 2. add 4 to the programCounter for the next cycle
		this.programCounter += 4;

		// 3. exceute
		try {
			this.execute(instruction);
		} catch (e: unknown) {
			let ex = e as Exception;
			this.takeTrap(ex);
			if (ex.isFatal()) {
				return false;
			}
		}

		// 4. handle interrupts
		const interrupt = this.checkPendingInterrupt();
		if (interrupt !== undefined) {
			this.takeTrap(interrupt);
		}

		return true;
	}

	/// Access the disk via virtio. This is a function to read and write with a dram directly (DMA).
	public diskAccess() {
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
		if ((flags1 & 2) === 0) {
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

	public takeTrap(trap: Trap) {
		this.takeTrapHelper(trap.exceptionCode, trap.isInterrupt);
	}

	// cause is an exception_code
	public takeTrapHelper(cause: number, isInterrupt: boolean) {
		const exceptionProgramCounter = this.programCounter - 4;
		const previousMode = this.mode;

		// Set an interrupt bit if a trap is an interrupt.
		if (isInterrupt) {
			cause = (1 << 63) | cause;
		}
		if (previousMode <= Mode.Supervisor && ((this.load_csr(MEDELEG) >> cause) & 1) != 0) {
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
