import { PlatformAccessory, Service, CharacteristicValue } from 'homebridge';
import { SmartHqPlatform } from './platform';

export class LaundryServices {
  private washerService?: Service;
  private dryerService?: Service;

  constructor(
    private readonly platform: SmartHqPlatform,
    private readonly accessory: PlatformAccessory,
    private readonly deviceData: any
  ) {
    // Accessory Information Metadata
    this.accessory.getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, 'GE SmartHQ')
      .setCharacteristic(this.platform.Characteristic.Model, deviceData.model || 'Laundry Appliance')
      .setCharacteristic(this.platform.Characteristic.SerialNumber, deviceData.id);

    // Initialize services based on device category exposed via SmartHQ Endpoint
    if (deviceData.type === 'cloud.smarthq.device.washer') {
      this.setupWasherService();
    } else if (deviceData.type === 'cloud.smarthq.device.dryer') {
      this.setupDryerService();
    }
  }

  private setupWasherService() {
    this.platform.log.debug('Configuring Washer service map for HomeKit...');
    
    // Representing washer cycle as a Valve (Water utility type) to expose operational state
    this.washerService = this.accessory.getService(this.platform.Service.Valve) 
      || this.accessory.addService(this.platform.Service.Valve, 'Washer');

    this.washerService.setCharacteristic(this.platform.Characteristic.Name, 'Washer');
    this.washerService.getCharacteristic(this.platform.Characteristic.ValveType)
      .setValue(this.platform.Characteristic.ValveType.WATER_FAUCET);

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
