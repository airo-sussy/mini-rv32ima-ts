import Cpu from "./cpu";

export default class Emulator {
	public cpu: Cpu;
	public constructor(binary: buffer, diskImage: buffer) {
		this.cpu = new Cpu(binary, diskImage);
	}

	public step() {
		return this.cpu.step();
	}
}
