import Device from "./abstract/device";
import { DRAM_BASE } from "./bus";
import { LoadAccessFault, StoreAMOAccessFault } from "./trap";

/// Default dram size (128MiB).
export const DRAM_SIZE: number = 1024 * 1024 * 128;

/// The dynamic random access dram (DRAM).
export default class Dram extends Device {
	public dram: buffer;
	public constructor(binary: buffer) {
		super();
		const dram = buffer.create(DRAM_SIZE);
		buffer.copy(dram, 0, binary, 0, DRAM_SIZE);
		this.dram = dram;
	}

	/// Load a byte from the little-endian dram.
	public load8(address: number): number {
		let index = address - DRAM_BASE;
		return buffer.readu8(this.dram, index);
	}

	/// Load 2 bytes from the little-endian dram.
	public load16(address: number): number {
		let index = address - DRAM_BASE;
		return buffer.readu16(this.dram, index);
	}

	/// Load 4 bytes from the little-endian dram.
	public load32(address: number): number {
		let index = address - DRAM_BASE;
		return buffer.readu32(this.dram, index);
	}

	/// Load 8 bytes from the little-endian dram.
	// When we support 64 bit mode, this will be implemented
	public load64(address: number) {
		throw "32 bit emulator vs 64 bits...";
	}

	/// Store a byte to the little-endian dram.
	public store8(address: number, value: number) {
		let index = address - DRAM_BASE;
		buffer.writeu8(this.dram, index, value);
	}

	/// Store 2 bytes to the little-endian dram.
	public store16(address: number, value: number) {
		let index = address - DRAM_BASE;
		buffer.writeu16(this.dram, index, value);
	}

	/// Store 4 bytes to the little-endian dram.
	public store32(address: number, value: number) {
		let index = address - DRAM_BASE;
		buffer.writeu32(this.dram, index, value);
	}

	/// Store 8 bytes to the little-endian dram.
	// When we support 64 bit mode, this will be implemented
	public store64(address: number, value: number) {
		throw "32 bit emulator vs 64 bits...";
	}

	public load(address: number, size: number): number {
		switch (size) {
			case 8:
				return this.load8(address);
			case 16:
				return this.load16(address);
			case 32:
				return this.load32(address);
			case 64:
				// 64 bit not implemented
				return this.load64(address) as unknown as number;
			default:
				throw new LoadAccessFault();
		}
	}
	public store(address: number, size: number, value: number): void {
		switch (size) {
			case 8:
				this.store8(address, value);
			case 16:
				this.store16(address, value);
			case 32:
				this.store32(address, value);
			case 64:
				this.store64(address, value);
			default:
				throw new StoreAMOAccessFault();
		}
	}
}
