/// All kinds of exceptions, an unusual condition occurring at run
/// time associated with an instruction in the current hardware thread.
export enum ExceptionCodes {
	InstructionAddressMisaligned = 0,
	InstructionAccessFault = 1,
	IllegalInstruction = 2,
	Breakpoint = 3,
	LoadAddressMisaligned = 4,
	LoadAccessFault = 5,
	StoreAMOAddressMisaligned = 6,
	StoreAMOAccessFault = 7,
	EnvironmentCallFromUMode = 8,
	EnvironmentCallFromSMode = 9,
	EnvironmentCallFromMMode = 11,
	InstructionPageFault = 12,
	LoadPageFault = 13,
	StoreAMOPageFault = 15,
}

export abstract class Trap {
	exceptionCode!: number;
	isInterrupt!: boolean;
}

export class Exception extends Trap {
	public exceptionCode: number = -1;
	public isInterrupt: boolean = false;
	public isFatal() {
		switch (this.exceptionCode) {
			case ExceptionCodes.InstructionAddressMisaligned:
			case ExceptionCodes.InstructionAccessFault:
			case ExceptionCodes.LoadAccessFault:
			case ExceptionCodes.StoreAMOAddressMisaligned:
			case ExceptionCodes.StoreAMOAccessFault:
				return true;
			default:
				return false;
		}
	}
}

// Implement helper classes

export class InstructionAddressMisaligned extends Exception {
	public exceptionCode: number = ExceptionCodes.InstructionAddressMisaligned;
}

export class InstructionAccessFault extends Exception {
	public exceptionCode: number = ExceptionCodes.InstructionAccessFault;
}

export class IllegalInstruction extends Exception {
	public exceptionCode: number = ExceptionCodes.IllegalInstruction;
}

export class Breakpoint extends Exception {
	public exceptionCode: number = ExceptionCodes.Breakpoint;
}

export class LoadAddressMisaligned extends Exception {
	public exceptionCode: number = ExceptionCodes.LoadAddressMisaligned;
}

export class LoadAccessFault extends Exception {
	public exceptionCode: number = ExceptionCodes.LoadAccessFault;
}

export class StoreAMOAddressMisaligned extends Exception {
	public exceptionCode: number = ExceptionCodes.StoreAMOAddressMisaligned;
}

export class StoreAMOAccessFault extends Exception {
	public exceptionCode: number = ExceptionCodes.StoreAMOAccessFault;
}

export class EnvironmentCallFromUMode extends Exception {
	public exceptionCode: number = ExceptionCodes.EnvironmentCallFromUMode;
}

export class EnvironmentCallFromSMode extends Exception {
	public exceptionCode: number = ExceptionCodes.EnvironmentCallFromSMode;
}

export class EnvironmentCallFromMMode extends Exception {
	public exceptionCode: number = ExceptionCodes.EnvironmentCallFromMMode;
}

export class InstructionPageFault extends Exception {
	public exceptionCode: number = ExceptionCodes.InstructionPageFault;
}

export class LoadPageFault extends Exception {
	public exceptionCode: number = ExceptionCodes.LoadPageFault;
}

export class StoreAMOPageFault extends Exception {
	public exceptionCode: number = ExceptionCodes.StoreAMOPageFault;
}

/// All kinds of interrupts, an external asynchronous event that may
/// cause a hardware thread to experience an unexpected transfer of
/// control.
export enum InterruptCodes {
	UserSoftwareInterrupt = 0,
	SupervisorSoftwareInterrupt = 1,
	MachineSoftwareInterrupt = 3,
	UserTimerInterrupt = 4,
	SupervisorTimerInterrupt = 5,
	MachineTimerInterrupt = 7,
	UserExternalInterrupt = 8,
	SupervisorExternalInterrupt = 9,
	MachineExternalInterrupt = 11,
}

export class Interrupt extends Trap {
	public exceptionCode: number = -1;
	public isInterrupt: boolean = true;
}

// Implement helper classes

export class UserSoftwareInterrupt extends Interrupt {
	exceptionCode = InterruptCodes.UserSoftwareInterrupt;
}

export class SupervisorSoftwareInterrupt extends Interrupt {
	exceptionCode = InterruptCodes.SupervisorSoftwareInterrupt;
}

export class MachineSoftwareInterrupt extends Interrupt {
	exceptionCode = InterruptCodes.MachineSoftwareInterrupt;
}

export class UserTimerInterrupt extends Interrupt {
	exceptionCode = InterruptCodes.UserTimerInterrupt;
}

export class SupervisorTimerInterrupt extends Interrupt {
	exceptionCode = InterruptCodes.SupervisorTimerInterrupt;
}

export class MachineTimerInterrupt extends Interrupt {
	exceptionCode = InterruptCodes.MachineTimerInterrupt;
}

export class UserExternalInterrupt extends Interrupt {
	exceptionCode = InterruptCodes.UserExternalInterrupt;
}

export class SupervisorExternalInterrupt extends Interrupt {
	exceptionCode = InterruptCodes.SupervisorExternalInterrupt;
}

export class MachineExternalInterrupt extends Interrupt {
	exceptionCode = InterruptCodes.MachineExternalInterrupt;
}
