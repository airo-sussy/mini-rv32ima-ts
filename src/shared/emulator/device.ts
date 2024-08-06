/*
	pub trait Device {
		fn load(&mut self, addr: u64, size: u64) -> Result<u64, Exception>;
		fn store(&mut self, addr: u64, size: u64, value: u64) -> Result<(), Exception>;
	}
*/

export default abstract class Device {
	abstract load(address: number, size: number): number;
	abstract store(address: number, size: number, value: number): void;
}
