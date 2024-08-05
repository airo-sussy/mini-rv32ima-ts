export default class Cpu {
	public readonly binary: buffer;
	public readonly diskImage: buffer;
	private programCounter: number = 0;

	public constructor(binary: buffer, diskImage: buffer) {
		this.binary = binary;
		this.diskImage = diskImage;
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
