// Break this out into separate repo.
const Grow = require('../../lib/Grow.js');
const raspio = require('raspi-io');
const five = require('johnny-five');
// const ascii = require('ascii-codes');

// Create a new board object
var board = new five.Board({
  io: new raspio()
});

// When board emits a 'ready' event run this start function.
board.on('ready', function start() {

  var pH_reading,
    eC_reading,
    data_interval,
    acidpump = new five.Pin('P1-11'),
    basepump = new five.Pin('P1-12'),
    nutrientpump = new five.Pin('P1-13');

  // Hack: Relays are inversed... make sure pumps are off.
  // Better hardware could take care of this... I'm not an electrical engineer.
  acidpump.high();
  basepump.high();
  nutrientpump.high();


  // Create a new grow instance and connect to https://grow.commongarden.org
  var grow = new Grow({
    uuid: '44f3bded-0245-4e07-b478-289f11207025',
    token: 'wt9HDFw3XSt4rmjWjAoic2oKmhyvJeWF',

    component: 'DrDose',

    // Properties can be updated by the API
    properties: {
      growfile: {
        ph: {
          min: 6.0,
          ideal: 6.15,
          max: 6.3,
        },
        ec: {
          min: 1400,
          ideal: 1500,
          max: 1700,
        },
      },
      interval: 10000,
      threshold: 0.5,
    },

    start: function () {
      // This must be called prior to any I2C reads or writes.
      // See Johnny-Five docs: http://johnny-five.io
      board.i2cConfig();

      // Read i2c response from ec sensor.
      board.i2cRead(0x64, 32, function (bytes) {
        let eC = Grow.parseAtlasEC(bytes);
        if (eC) eC_reading = eC;
      });

      // Read i2c response from pH sensor.
      board.i2cRead(0x63, 7, (bytes) => {
        let pH = Grow.parseAtlasPH(bytes);
        if (pH) pH_reading = pH;
      });

      let interval = this.get('interval');
      setInterval(()=> {
        this.ph_data();
        this.ec_data();
      }, interval);


      let targets = this.get('growfile');
      this.registerTargets(growfile);

      let threshold = this.get('threshold');

      // Listen for correction events from our PID controller
      this.on('correction', (key, correction) => {
        console.log(correction);

        if (Math.abs(correction) > threshold) {
          if (key === 'ph') {
            if (correction < 0) {
              this.call('acid', Math.abs(correction));
            } else {
              this.call('base', correction);
            }
          } else if (key === 'ec') {
            if (correction < 0) {
              this.emit('ec too high, dilute water');
            } else {
              this.call('nutrient', correction);
            }
          }
        }
      });
    },

    stop: function () {
      clearInterval(data_interval);
      this.removeAllListeners();
    },

    acid: function (duration) {
      acidpump.low();

      var duration = Number(grow.get('duration', 'acid'));
      setTimeout(function () {
        acidpump.high();
      }, duration);
    },
    
    base: function (duration) {
      basepump.low();

      setTimeout(function () {
        basepump.high();
      }, duration);
    },

    nutrient: function (duration) {
      nutrientpump.low();

      setTimeout(function () {
        nutrientpump.high();
      }, duration);
    },

    ec_data: function () {
      // Request a reading
      board.i2cWrite(0x64, [0x52, 0x00]);

      if (eC_reading) {
        grow.emit('ec', eC_reading);

        console.log('ec: ' + eC_reading);
      }
    },

    ph_data: function () {
      // Request a reading
      board.i2cWrite(0x63, [0x52, 0x00]);

      if (pH_reading) {
        // Send data to the Grow-IoT app.
        grow.emit('ph', pH_reading);

        console.log('ph: ' + pH_reading);
      }
    }
  });

  grow.connect({
    host: '10.0.0.198',
    port: 3001
  });

  // grow.connect({
  //   host: 'grow.commongarden.org',
  //   port: 443,
  //   ssl: true
  // });
});
