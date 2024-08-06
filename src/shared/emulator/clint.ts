/// The address of a mtimecmp register starts. A mtimecmp is a dram mapped machine mode timer

import { CLINT_BASE } from "./bus";
import Device from "./abstract/device";

/// compare register, used to trigger an interrupt when mtimecmp is greater than or equal to mtime.
export const CLINT_MTIMECMP: number = CLINT_BASE + 0x4000;
/// The address of a timer register. A mtime is a machine mode timer register which runs at a
/// constant frequency.
export const CLINT_MTIME: number = CLINT_BASE + 0xbff8;

/// The core-local interruptor (CLINT).
export default class Clint extends Device {
	private mtime: number = 0;
	private mtimecmp: number = 0;
	public constructor() {
		super();
	}

	private load64(address: number): number {
		switch (address) {
			case CLINT_MTIMECMP:
				return this.mtimecmp;
			case CLINT_MTIME:
				return this.mtime;
			default:
				return 0;
		}
	}

	private store64(address: number, value: number) {
		switch (address) {
			case CLINT_MTIMECMP:
				this.mtimecmp = value;
				break;
			case CLINT_MTIME:
				this.mtime = value;
				break;
			default:
				break;
		}
	}

	public load(address: number, size: number): number {
		switch (size) {
			case 64:
				return this.load64(address);
			default:
				throw new LoadAccessFault();
		}
	}
	public store(address: number, size: number, value: number): void {
		switch (size) {
			case 64:
				this.store64(address, value);
				break;
			default:
				throw new StoreAMOAccessFault();
		}
	}
}
