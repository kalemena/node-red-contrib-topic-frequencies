const ExpireArray = require('expire-array')

module.exports = function(RED) {

    function TopicFrequencies(config) {
        console.log('TopicFrequencies: init()');
        RED.nodes.createNode(this, config);

        var node = this;
       
        // Cache for events per topic
        var metricValues = {};

        // Initialize node
        node.status({ });
        node.units = config.units;
        node.interval = config.interval;
        node.reportUnits = config.reportUnits;
        node.reportInterval = config.reportInterval;
        node.valueKey = config.valueKey;
        node.alignToClock = config.alignToClock;

        console.log("TopicFrequencies: " + node.reportInterval + " | " + node.reportUnits + " | " + node.alignToClock);

        function measure() {

          console.log(`TopicFrequencies: ${new Date()} > ${node.interval} | ${node.units}`);

          msg = {};
          msg.topics = {};
          msg.metricValues = metricValues; // FIXME: remove this

          // computed fields
          topicsIntervalCount = 0;
          topicsIntervalMessageCount = 0;
          topicsIntervalCountMin = undefined;
          topicsIntervalCountMax = undefined;

          for (key in metricValues) {
            min = undefined;
            max = undefined;            
            let count = 0; metricValues[key].all().forEach(function(element, i) {
              count += element;

              // interval min/max metrics
              if(min == undefined) min = element;
              min = Math.min(min, element);
              if(max == undefined) max = element;
              max = Math.max(max, element);
              });

            messageCount = metricValues[key].all().length;

            // Building message output
            msg.topics[key] = {};
            
            // interval metrics for topic
            msg.topics[key].intervalCount = count;
            msg.topics[key].intervalCountAvg = count / messageCount;
            msg.topics[key].intervalCountMin = min;
            msg.topics[key].intervalCountMax = max;
            msg.topics[key].intervalMessageCount = messageCount;

            // interval metrics cross-topics
            topicsIntervalCount += count;
            topicsIntervalMessageCount += messageCount;
            if(topicsIntervalCountMin == undefined) topicsIntervalCountMin = min;
            topicsIntervalCountMin = Math.min(topicsIntervalCountMin, min);
            if(topicsIntervalCountMax == undefined) topicsIntervalCountMax = max;
            topicsIntervalCountMax = Math.max(topicsIntervalCountMax, max);
          };
          
          msg.global = {}
          msg.global.intervalCount = topicsIntervalCount;
          msg.global.intervalMessageCount = topicsIntervalMessageCount;
          msg.global.intervalCountAvg = topicsIntervalCount / topicsIntervalMessageCount;
          msg.global.intervalCountMin = topicsIntervalCountMin;
          msg.global.intervalCountMax = topicsIntervalCountMax;

          msg.interval = parseInt(node.interval);
          msg.units = node.units;
          msg.alignToClock = node.alignToClock;
         
          node.send([msg, null]);
          showCount();
        }

        function reset() {
          metricValues = {};
        }

        function getRemainingMs(units, interval) {
          var now = new Date();
          switch (units) {
            case "seconds": {
              return interval * 1000 - now.getMilliseconds();
            }; break;

            case "minutes": {
              return ( interval * 60 - now.getSeconds()) * 1000 - now.getMilliseconds();
            }; break;

            case "hours": {
              return (interval * 3600 - now.getSeconds()) * 1000 - now.getMilliseconds();
            }; break;
          };
        }

        function intervalToMs(units, interval) {
          switch (units) {
            case "seconds": {
              return interval * 1000;
            }; break;

            case "minutes": {
              return interval * 60 * 1000;
            }; break;

            case "hours": {
              return interval * 3600 * 1000;
            }; break;
          };
        }

        function runClock() {
            var timeToNextTick = getRemainingMs(node.reportUnits, node.reportInterval);
           
            return setTimeout(function() {
                measure();
                node.internalTimer = runClock();
            }, timeToNextTick);
        }

        function startGenerator() {
          if (node.alignToClock) {
            node.internalTimer = runClock();
          } else {
            var interval = intervalToMs(node.reportUnits, node.reportInterval);
            console.log("TopicFrequencies: Report Interval: " + interval);
            node.internalTimer = setInterval(measure, interval);
          };
        }

        function stopGenerator() {
            if (node.alignToClock) {
              clearTimeout(node.internalTimer);
            } else {
              clearInterval(node.internalTimer);
            };
        }

        function showCount() {
          // node.status({ fill: "green", shape: "dot", text: `${ctrGlobalCount} / ${ctrGlobalMessageCount}` });
          node.status({ fill: "green", shape: "dot", text: `` });
        };

        showCount();
        startGenerator();

        this.on('input', function(msg) {
          if (msg.topic == "control") {
            // This is a control message
            switch (msg.payload) {
              case "reset": {
                reset();

              }; break;

              case "report": {
                measure();

              }; break;

              default: {
                node.status({ fill: "red", shape: "dot", text: "Invalid control command: " + msg.payload });
              }
            }

          } else {
            // Count messages
            if (msg.topic==undefined) msg.topic="";
            
            if (metricValues[msg.topic]==undefined) {
              var interval = intervalToMs(node.units, node.interval);
              metricValues[msg.topic] = ExpireArray(interval);
            }

            var value = 1; // default
            if((msg[node.valueKey]!=undefined) && !isNaN(msg.payload))
              value = Number(msg[node.valueKey]);
            metricValues[msg.topic].push(value);

            showCount();
            node.send([null, msg]);
          }
        });

        this.on('close', function() {
          // tidy up any state
          console.log("TopicFrequencies: cleanup()");
          stopGenerator();
        });
    }

    RED.nodes.registerType("Topic Frequencies", TopicFrequencies);
}
