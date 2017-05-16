const Grow = require('../../lib/Grow.js');
const ascii = require('ascii-codes');
const http = require('http');
const url = require('url');
const raspio = require('raspi-io');
const five = require('johnny-five');
const later = require('later');
const Hs100Api = require('hs100-api');
const growfile = require('../growfiles/cannabis');
const _ = require('underscore');
// const Cam = require('./webcam.js');
const Controller = require('node-pid-controller');

// Use local time, not UTC.
later.date.localTime();

// Create a new board object
const board = new five.Board({
  io: new raspio()
});

// When board emits a 'ready' event run this start function.
board.on('ready', function start() {
  // Declare needed variables.
  var pH_reading, eC_reading, water_temp, emit_data;

  var lux = new five.Light({
    controller: 'TSL2561'
  });

  var multi = new five.Multi({
    controller: 'SI7020'
  });

  var growHub = new Grow({
    uuid: '48d7251e-45c2-43b3-84bd-cdac0bd8c412',
    token: '3XMJdsSsTqmxMYjEMzaBtqrGwk7hxozv',
    component: 'GrowHub',

    // camera: Cam,

    properties: {
      light_state: null,
      duration: 2000,
      interval: 6000,
      growfile: growfile,
      targets: {},
    },

    start: function () {
      console.log('Grow-Hub initialized.');

      // This must be called prior to any I2C reads or writes.
      // See Johnny-Five docs: http://johnny-five.io
      board.i2cConfig();

      board.i2cRead(0x64, 32, function (bytes) {
        var bytelist = [];
        if (bytes[0] === 1) {
          // console.log(bytes);
          for (i = 0; i < bytes.length; i++) {
            if (bytes[i] !== 1 && bytes[i] !== 0) {
              bytelist.push(ascii.symbolForDecimal(bytes[i]));
            }
          }
          eC_reading = bytelist.join('');
        }
      });

      board.i2cRead(0x63, 7, function (bytes) {
        var bytelist = [];
        if (bytes[0] === 1) {
          for (i = 0; i < bytes.length; i++) {
            if (bytes[i] !== 1 && bytes[i] !== 0) {
              bytelist.push(ascii.symbolForDecimal(bytes[i]));
            }
          }
          pH_reading = bytelist.join('');
        }
      });

      board.i2cRead(0x66, 7, function (bytes) {
        var bytelist = [];
        if (bytes[0] === 1) {
          for (i = 0; i < bytes.length; i++) {
            if (bytes[i] !== 1 && bytes[i] !== 0) {
              bytelist.push(ascii.symbolForDecimal(bytes[i]));
            }
          }
          water_temp = bytelist.join('');
        }
      });

      var client = new Hs100Api.Client();

      client.startDiscovery().on('plug-new', (plug) => {
        if (plug.name === 'Plant Light') {
          console.log('Light connected');
          // console.log(plug);
          this.light = plug;
          // this.light.getInfo().then((data)=> {
          //   // console.log(data);
          //   if (data.sysInfo.relay_state === 1) {
          //     this.set('light_state', 'on');
          //   } else {
          //     this.set('light_state', 'off');
          //   }
          // }).catch(
          //   (reason) => {
          //     console.log('Handle rejected promise ('+reason+') here.');
          //   }
          // );
        }
      });


      var interval = this.get('interval');

      emit_data = setInterval(()=> {
        this.temp_data();
        this.hum_data();
        this.ph_data();
        this.ec_data();
        this.water_temp_data();
        this.light_data();
        this.power_data();
      }, interval);

      setTimeout(()=> {
        this.call('turn_light_on');
      }, 3000);

      // let grow = this.get('growfile');
      // console.log(growfile);
      // this.startGrow(growfile);
    },

    stop: function () {
      clearInterval(emit_data);
    },

    restart: function () {
      let growfile = this.get('growfile');
      console.log(growfile);
      // this.removeTargets(growfile.targets);
      // this.start();
    },
    
    day: function () {
      console.log('It is day!');
      this.call('turn_light_on');
    },

    night: function () {
      console.log('It is night!');
      this.call('turn_light_off');
    },

    // Note, there are probably more elegant ways of handling subthing methods.
    turn_light_on: function () {
      console.log('Light on');
      if (this.light) {
        this.light.setPowerState(true);
      }          
      this.set('light_state', 'on');
    },

    turn_light_off: function () {
      console.log('Light off');
      if (this.light) {
        this.light.setPowerState(false);
      }          
      this.set('light_state', 'off');
    },

    power_data: function () {
    	// TODO: for influx db, the power data must be a number not an object...
      this.light.getInfo().then((data)=> {
        let powerData = data.consumption.get_realtime;
        this.emit({
          type: 'light_power_current',
          value: powerData.current
        });
        this.emit({
          type: 'light_power_voltage',
          value: powerData.voltage
        });
        this.emit({
          type: 'light_power_power',
          value: powerData.power
        });
        this.emit({
          type: 'light_power_total',
          value: powerData.total
        });
      });
    },

    ec_data: function () {
      // Request a reading, 
      board.i2cWrite(0x64, [0x52, 0x00]);

      eC_reading = this.parseEC(eC_reading);

      if (eC_reading) {
        this.emit({
          type: 'ec',
          value: eC_reading
        });

        console.log('Conductivity: ' + eC_reading);
      }
    },

    ph_data: function () {
      // Request a reading
      board.i2cWrite(0x63, [0x52, 0x00]);

      if (this.ispH(pH_reading)) {
        this.emit({
          type: 'ph',
          value: pH_reading
        });

        console.log('ph: ' + pH_reading);
      }
    },

    light_data: function () {
      this.emit({
        type: 'lux',
        value: lux.level
      });
      
      console.log('Light: ' + lux.level);
    },

    water_temp_data: function () {
      // Request a reading
      board.i2cWrite(0x66, [0x52, 0x00]);

      this.emit({
        type: 'water_temperature',
        value: water_temp
      });

      console.log('Resevoir temp: ' + water_temp);
    },

    temp_data: function () {
      var currentTemp = multi.thermometer.celsius;

      this.emit({
        type: 'temperature',
        value: currentTemp
      });

      console.log('Temperature: ' + currentTemp);
    },

    hum_data: function () {
      var currentHumidity = multi.hygrometer.relativeHumidity;
      this.emit({
        type: 'humidity',
        value: currentHumidity
      });

      console.log('Humidity: ' + currentHumidity);
    }
  });

  growHub.connect({
    host: '10.0.0.198',
    port: 3001
  });

  // Default is localhost: 3000
  // growHub.connect({
  //   host: 'grow.commongarden.org',
  //   tlsOpts: {
  //     tls: {
  //       servername: 'galaxy.meteor.com'
  //     }
  //   },
  //   port: 443,
  //   ssl: true
  // });
});
