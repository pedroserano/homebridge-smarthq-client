import { PlatformAccessory } from 'homebridge';
import chalk from 'chalk';

/**
 * Setup Washer Services
 * Controls Active state, remaining cycle duration timers, and door lock safety profiles
 */
export function setupWasherServices(
  this: any, 
  accessory: PlatformAccessory, 
  deviceServices: any[], 
  deviceId: string
) {
  const Service = this.api.hap.Service;
  const Characteristic = this.api.hap.Characteristic;

  this.debug('cyan', `Initializing structural features for Washer [${deviceId}]`);

  // --- 1. VALVE CONTROL & DURATION RUNTIMES ---
  const washerValve = accessory.getService(Service.Valve) 
    || accessory.addService(Service.Valve, 'Washer Status');

  washerValve.getCharacteristic(Characteristic.ValveType)
    .setValue(Characteristic.ValveType.WATER_FAUCET);

  let currentCycleState = 'idle';
  let remainingSeconds = 0;
  let isLocked = false;

  // Extract baseline metrics out of initialization logs payload
  const cycleStatusService = deviceServices.find(s => s.serviceDeviceType === 'cloud.smarthq.device.washer');
  if (cycleStatusService && cycleStatusService.state) {
    currentCycleState = cycleStatusService.state.cycleState || 'idle';
    // Convert API minutes variable safely down to HomeKit absolute seconds format
    remainingSeconds = (cycleStatusService.state.timeRemaining || 0) * 60;
    isLocked = cycleStatusService.state.doorLocked || false;
  }

  washerValve.getCharacteristic(Characteristic.Active)
    .onGet(() => currentCycleState === 'running' ? Characteristic.Active.ACTIVE : Characteristic.Active.INACTIVE);

  washerValve.getCharacteristic(Characteristic.InUse)
    .onGet(() => currentCycleState === 'running' ? Characteristic.InUse.IN_USE : Characteristic.InUse.NOT_IN_USE);

  washerValve.getCharacteristic(Characteristic.RemainingDuration)
    .onGet(() => remainingSeconds);

  // --- 2. DOOR LOCK MECHANISM STATUS ---
  const lockMechanism = accessory.getService(Service.LockMechanism)
    || accessory.addService(Service.LockMechanism, 'Washer Door Lock');

  lockMechanism.getCharacteristic(Characteristic.LockCurrentState)
    .onGet(() => isLocked ? Characteristic.LockCurrentState.SECURED : Characteristic.LockCurrentState.UNSECURED);

  // Read-only configuration toggle since lock is governed purely by internal hardware operations
  lockMechanism.getCharacteristic(Characteristic.LockTargetState)
    .onGet(() => isLocked ? Characteristic.LockTargetState.SECURED : Characteristic.LockTargetState.UNSECURED)
    .onSet((value, callback) => {
      this.debug('cyan', 'Washer Lock target adjustments are read-only and bound to actual machine execution cycle paths.');
      setTimeout(() => {
        lockMechanism.updateCharacteristic(Characteristic.LockTargetState, isLocked ? Characteristic.LockTargetState.SECURED : Characteristic.LockTargetState.UNSECURED);
      }, 500);
    });

  // --- 3. LIVE EVENT STREAM BUS LISTENER ---
  this.client.on(`${deviceId}-state-changed`, (updatedState: any) => {
    if (updatedState) {
      // Synchronize cycle operation changes
      if (updatedState.cycleState !== undefined) {
        currentCycleState = updatedState.cycleState;
        const nextActive = currentCycleState === 'running' ? Characteristic.Active.ACTIVE : Characteristic.Active.INACTIVE;
        const nextInUse = currentCycleState === 'running' ? Characteristic.InUse.IN_USE : Characteristic.InUse.NOT_IN_USE;
        
        washerValve.updateCharacteristic(Characteristic.Active, nextActive);
        washerValve.updateCharacteristic(Characteristic.InUse, nextInUse);
      }

      // Synchronize dynamic timer intervals 
      if (updatedState.timeRemaining !== undefined) {
        remainingSeconds = updatedState.timeRemaining * 60;
        this.debug('cyan', `Washer remaining cycle duration ticker synchronized: ${updatedState.timeRemaining} minutes.`);
        washerValve.updateCharacteristic(Characteristic.RemainingDuration, remainingSeconds);
      }

      // Synchronize security physical latch configurations
      if (updatedState.doorLocked !== undefined) {
        isLocked = updatedState.doorLocked;
        const nextLockState = isLocked ? Characteristic.LockCurrentState.SECURED : Characteristic.LockCurrentState.UNSECURED;
        
        this.debug('cyan', `Washer security structural lock altered: ${isLocked ? 'SECURED' : 'UNSECURED'}`);
        lockMechanism.updateCharacteristic(Characteristic.LockCurrentState, nextLockState);
        lockMechanism.updateCharacteristic(Characteristic.LockTargetState, isLocked ? Characteristic.LockTargetState.SECURED : Characteristic.LockTargetState.UNSECURED);
      }
    }
  });
}

/**
 * Setup Dryer Services
 * Controls execution status toggles and downstream remaining duration metrics
 */
export function setupDryerServices(
  this: any, 
  accessory: PlatformAccessory, 
  deviceServices: any[], 
  deviceId: string
) {
  const Service = this.api.hap.Service;
  const Characteristic = this.api.hap.Characteristic;

  this.debug('magenta', `Initializing structural features for Dryer [${deviceId}]`);

  // --- 1. CORE OPERATIONAL SWITCH BUTTON ---
  const dryerSwitch = accessory.getService(Service.Switch) 
    || accessory.addService(Service.Switch, 'Dryer Control');

  // --- 2. OPTIONAL TIMER VALVE INTERFACE FOR ACCURATE REMAINING RUNTIMES ---
  const dryerRuntimeMonitor = accessory.getService(Service.Valve)
    || accessory.addService(Service.Valve, 'Dryer Runtime Status', 'dryer-valve-suffix');

  dryerRuntimeMonitor.getCharacteristic(Characteristic.ValveType)
    .setValue(Characteristic.ValveType.WATER_FAUCET);

  let currentCycleState = 'idle';
  let remainingSeconds = 0;

  const remoteTriggerService = deviceServices.find(s => s.serviceDeviceType === 'cloud.smarthq.device.dryer');
  if (remoteTriggerService && remoteTriggerService.state) {
    currentCycleState = remoteTriggerService.state.cycleState || 'idle';
    remainingSeconds = (remoteTriggerService.state.timeRemaining || 0) * 60;
  }

  dryerSwitch.getCharacteristic(Characteristic.On)
    .onGet(() => currentCycleState === 'running')
    .onSet(async (value) => {
      if (value) {
        try {
          this.log.info(chalk.green(`[SmartHQ] Dispatching remote execution start trigger to Dryer: ${deviceId}`));
          await this.client.executeCommand(deviceId, {
            command: 'cloud.smarthq.command.trigger.do',
            domain: 'cloud.smarthq.domain.start'
          });
        } catch (error) {
          this.log.error(chalk.red(`[SmartHQ] Remote trigger execution error on Dryer [${deviceId}]:`), error);
          setTimeout(() => {
            dryerSwitch.updateCharacteristic(Characteristic.On, false);
          }, 1000);
        }
      }
    });

  dryerRuntimeMonitor.getCharacteristic(Characteristic.Active)
    .onGet(() => currentCycleState === 'running' ? Characteristic.Active.ACTIVE : Characteristic.Active.INACTIVE);

  dryerRuntimeMonitor.getCharacteristic(Characteristic.RemainingDuration)
    .onGet(() => remainingSeconds);

  // --- 3. LIVE EVENT STREAM BUS LISTENER ---
  this.client.on(`${deviceId}-state-changed`, (updatedState: any) => {
    if (updatedState) {
      if (updatedState.cycleState !== undefined) {
        currentCycleState = updatedState.cycleState;
        const isRunning = currentCycleState === 'running';
        
        dryerSwitch.updateCharacteristic(Characteristic.On, isRunning);
        dryerRuntimeMonitor.updateCharacteristic(Characteristic.Active, isRunning ? Characteristic.Active.ACTIVE : Characteristic.Active.INACTIVE);
      }

      if (updatedState.timeRemaining !== undefined) {
        remainingSeconds = updatedState.timeRemaining * 60;
        this.debug('magenta', `Dryer remaining runtime counter sync: ${updatedState.timeRemaining} minutes.`);
        dryerRuntimeMonitor.updateCharacteristic(Characteristic.RemainingDuration, remainingSeconds);
      }
    }
  });
}
