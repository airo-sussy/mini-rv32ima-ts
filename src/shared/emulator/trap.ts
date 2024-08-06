/// All kinds of exceptions, an unusual condition occurring at run
/// time associated with an instruction in the current hardware thread.
export enum Exception {
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

/// All kinds of interrupts, an external asynchronous event that may
/// cause a hardware thread to experience an unexpected transfer of
/// control.
export enum Interrupt {
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

// TODO: implement take_trap for Interrupt and Exception
// TODO: implement intuitive error handling
