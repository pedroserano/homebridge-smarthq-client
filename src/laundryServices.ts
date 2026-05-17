import { PlatformAccessory } from 'homebridge';
import chalk from 'chalk';

/**
 * Setup Washer Services
 * Listens for real-time state change updates emitted by the SmartHQ Client event bus
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

  const washerValve = accessory.getService(Service.Valve) 
    || accessory.addService(Service.Valve, 'Washer Status');

  washerValve.getCharacteristic(Characteristic.ValveType)
    .setValue(Characteristic.ValveType.WATER_FAUCET);

  // Initialize variable to mirror state locally
  let currentCycleState = 'idle';

  // Pull baseline properties from the initial services payload array parsed on discovery
  const cycleStatusService = deviceServices.find(s => s.serviceDeviceType === 'cloud.smarthq.device.washer');
  if (cycleStatusService && cycleStatusService.state) {
    currentCycleState = cycleStatusService.state.cycleState || 'idle';
  }

  // Bind Homebridge GET state loop directly to our tracked state variable
  washerValve.getCharacteristic(Characteristic.Active)
    .onGet(() => {
      return currentCycleState === 'running'
        ? Characteristic.Active.ACTIVE 
        : Characteristic.Active.INACTIVE;
    });

  // Listen for push notifications emitted from the underlying SmartHQ Client instance
  this.client.on(`${deviceId}-state-changed`, (updatedState: any) => {
    if (updatedState && updatedState.cycleState !== undefined) {
      currentCycleState = updatedState.cycleState;
      
      const nextActiveValue = currentCycleState === 'running'
        ? Characteristic.Active.ACTIVE
        : Characteristic.Active.INACTIVE;

      this.debug('cyan', `Push update received for Washer [${deviceId}]: cycleState is now ${currentCycleState}`);
      washerValve.updateCharacteristic(Characteristic.Active, nextActiveValue);
    }
  });
}

/**
 * Setup Dryer Services
 * Handles live event tracking and dispatches command triggers to the SmartHQ Client execution engine
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

  const dryerSwitch = accessory.getService(Service.Switch) 
    || accessory.addService(Service.Switch, 'Dryer Control');

  let currentCycleState = 'idle';

  // Read initial discovery state payload
  const remoteTriggerService = deviceServices.find(s => s.serviceDeviceType === 'cloud.smarthq.device.dryer');
  if (remoteTriggerService && remoteTriggerService.state) {
    currentCycleState = remoteTriggerService.state.cycleState || 'idle';
  }

  dryerSwitch.getCharacteristic(Characteristic.On)
    .onGet(() => {
      return currentCycleState === 'running';
    })
    .onSet(async (value) => {
      if (value) {
        try {
          this.log.info(chalk.green(`[SmartHQ] Dispatching remote execution start trigger to Dryer: ${deviceId}`));
          
          // Execute command via client pipeline matching your exact discovered logs layout
          await this.client.executeCommand(deviceId, {
            command: 'cloud.smarthq.command.trigger.do',
            domain: 'cloud.smarthq.domain.start'
          });
        } catch (error) {
          this.log.error(chalk.red(`[SmartHQ] Remote trigger execution error on Dryer [${deviceId}]:`), error);
          
          // Revert UI toggle button state instantly upon command failure
          setTimeout(() => {
            dryerSwitch.updateCharacteristic(Characteristic.On, false);
          }, 1000);
        }
      }
    });

  // Track state changes dynamically using event notifications
  this.client.on(`${deviceId}-state-changed`, (updatedState: any) => {
    if (updatedState && updatedState.cycleState !== undefined) {
      currentCycleState = updatedState.cycleState;
      
      this.debug('magenta', `Push update received for Dryer [${deviceId}]: cycleState is now ${currentCycleState}`);
      dryerSwitch.updateCharacteristic(Characteristic.On, currentCycleState === 'running');
    }
  });
}
