import { PlatformAccessory, Service } from 'homebridge';
import chalk from 'chalk';

/**
 * Setup Washer Services
 * Modeled exactly after refrigeratorServices mapping
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

  // 1. Refrigerator standard: Expose base operational service block
  const washerValve = accessory.getService(Service.Valve) 
    || accessory.addService(Service.Valve, 'Washer Status');

  washerValve.getCharacteristic(Characteristic.ValveType)
    .setValue(Characteristic.ValveType.WATER_FAUCET);

  // 2. Refrigerator standard: Use an onGet handler that reads from the local cached state array
  washerValve.getCharacteristic(Characteristic.Active)
    .onGet(() => {
      // The plugin maintains internal global states populated by websocket/long-poll updates
      const currentState = this.client.getCachedDeviceState?.(deviceId) || {};
      return currentState.cycleState === 'running' 
        ? Characteristic.Active.ACTIVE 
        : Characteristic.Active.INACTIVE;
    });

  // 3. Refrigerator standard: Handle custom platform user settings if present in config
  if (this.config.addAlerts) {
    const alertService = accessory.getService('Washer Cycle Alert')
      || accessory.addService(Service.ContactSensor, 'Washer Cycle Alert', 'washer-alert-uuid');
      
    this.debug('cyan', 'Optional cycle monitoring contact alerts injected.');
  }
}

/**
 * Setup Dryer Services
 * Modeled exactly after refrigeratorServices mapping
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

  // Bind local data retrieval caching patterns
  dryerSwitch.getCharacteristic(Characteristic.On)
    .onGet(() => {
      const currentState = this.client.getCachedDeviceState?.(deviceId) || {};
      return currentState.cycleState === 'running';
    })
    // Refrigerator standard: Set execution loops with inline error fallback messaging
    .onSet(async (value) => {
      if (value) {
        try {
          this.log.info(chalk.green(`[SmartHQ] Dispatch remote start array command down to Dryer: ${deviceId}`));
          await this.client.executeCommand(deviceId, {
            command: 'cloud.smarthq.command.trigger.do',
            domain: 'cloud.smarthq.domain.start'
          });
        } catch (error) {
          this.log.error(chalk.red(`[SmartHQ] Remote trigger sequence execution error on Dryer [${deviceId}]:`), error);
          // Refrigerator convention fallback: instantly force-revert the UI toggle state back on failure
          setTimeout(() => {
            dryerSwitch.updateCharacteristic(Characteristic.On, false);
          }, 1000);
        }
      }
    });
}
