import { PlatformAccessory } from 'homebridge';
import chalk from 'chalk';

/**
 * Setup Washer Services
 * Maps to HomeKit via a Valve Service to display cycle operational state
 */
export function setupWasherServices(
  this: any, 
  accessory: PlatformAccessory, 
  deviceServices: any[], 
  deviceId: string
) {
  this.log.info(`Processing capability mapping for Washer [ID: ${deviceId}]`);

  // Locate the native SmartHQ state domain based on your log structure
  const cycleStatus = deviceServices.find(s => s.serviceDeviceType === 'cloud.smarthq.device.washer');

  if (cycleStatus) {
    // Get HAP Service and Characteristic shortcuts from the platform context
    const Service = this.api.hap.Service;
    const Characteristic = this.api.hap.Characteristic;

    const washerValve = accessory.getService(Service.Valve) 
      || accessory.addService(Service.Valve, 'Washer Status');

    // Configure as a functional Water Faucet view inside HomeKit
    washerValve.getCharacteristic(Characteristic.ValveType)
      .setValue(Characteristic.ValveType.WATER_FAUCET);

    // Bind HomeKit GET monitoring hook into SmartHQ Client API data
    washerValve.getCharacteristic(Characteristic.Active)
      .onGet(async () => {
        try {
          const deviceState = await this.client.getDeviceState(deviceId);
          return deviceState.cycleState === 'running' 
            ? Characteristic.Active.ACTIVE 
            : Characteristic.Active.INACTIVE;
        } catch (error) {
          this.log.error(chalk.red('Failed to fetch live Washer state:'), error);
          return Characteristic.Active.INACTIVE;
        }
      });

    this.debug('cyan', 'Washer Active characteristic properties mounted successfully.');
  }
}

/**
 * Setup Dryer Services
 * Maps to HomeKit via a Switch Service for execution tracking and remote triggering
 */
export function setupDryerServices(
  this: any, 
  accessory: PlatformAccessory, 
  deviceServices: any[], 
  deviceId: string
) {
  this.log.info(`Processing capability mapping for Dryer [ID: ${deviceId}]`);

  const remoteStart = deviceServices.find(s => s.domainType === 'cloud.smarthq.domain.start');

  if (remoteStart) {
    const Service = this.api.hap.Service;
    const Characteristic = this.api.hap.Characteristic;

    const dryerSwitch = accessory.getService(Service.Switch) 
      || accessory.addService(Service.Switch, 'Dryer Automation Control');

    // Bind state reporting status
    dryerSwitch.getCharacteristic(Characteristic.On)
      .onGet(async () => {
        try {
          const deviceState = await this.client.getDeviceState(deviceId);
          return deviceState.cycleState === 'running';
        } catch (error) {
          this.log.error(chalk.red('Failed to fetch live Dryer state:'), error);
          return false;
        }
      })
      // Bind execution trigger hooks directly to your log commands
      .onSet(async (value) => {
        if (value) {
          try {
            this.log.info(`Executing API pipeline remote start trigger command on Dryer [ID: ${deviceId}]`);
            await this.client.executeCommand(deviceId, {
              command: 'cloud.smarthq.command.trigger.do',
              domain: 'cloud.smarthq.domain.start'
            });
          } catch (error) {
            this.log.error(chalk.red('Failed to dispatch remote execute command trigger to Dryer:'), error);
          }
        }
      });

    this.debug('magenta', 'Dryer Remote Switch options registered successfully.');
  }
}

    // Bind Active states (Is the washer currently running a cycle?)
    this.washerService.getCharacteristic(this.platform.Characteristic.Active)
      .onGet(this.getWasherActiveState.bind(this));
  }

  private setupDryerService() {
    this.platform.log.debug('Configuring Dryer service map for HomeKit...');

    // Representing dryer as a generic switch for remote triggering/monitoring state
    this.dryerService = this.accessory.getService(this.platform.Service.Switch)
      || this.accessory.addService(this.platform.Service.Switch, 'Dryer');

    this.dryerService.getCharacteristic(this.platform.Characteristic.On)
      .onGet(this.getDryerState.bind(this))
      .onSet(this.setDryerState.bind(this));
  }

  // GET/SET Handlers linking Homebridge events to the SmartHQ client layer
  private async getWasherActiveState(): Promise<CharacteristicValue> {
    const state = await this.platform.smartHqClient.getDeviceState(this.deviceData.id);
    return state.cycleState === 'running' 
      ? this.platform.Characteristic.Active.ACTIVE 
      : this.platform.Characteristic.Active.INACTIVE;
  }

  private async getDryerState(): Promise<CharacteristicValue> {
    const state = await this.platform.smartHqClient.getDeviceState(this.deviceData.id);
    return state.cycleState === 'running';
  }

  private async setDryerState(value: CharacteristicValue) {
    if (value as boolean) {
      this.platform.log.info('Sending remote command to execute target dryer cycle via SmartHQ.');
      await this.platform.smartHqClient.executeCommand(this.deviceData.id, {
        command: 'cloud.smarthq.command.trigger.do',
        domain: 'cloud.smarthq.domain.start'
      });
    }
  }
}
