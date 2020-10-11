const ExpireArray = require('expire-array')

module.exports = function(RED) {

    function TopicFrequencies(config) {
        console.log('TopicFrequencies: init()');
        RED.nodes.createNode(this, config);

        var node = this;
       
        // Cache for events per topic
        var metricValues = {};
        var nodeCycles = 0;

        var tempGlobal = {};

        // Initialize node
        node.status({ });
        node.units = config.units;
        node.interval = config.interval;
        node.reportUnits = config.reportUnits;
        node.reportInterval = config.reportInterval;
        node.topicKey = config.topicKey;
        node.valueKey = config.valueKey;
        node.alignToClock = config.alignToClock;

        console.log(`TopicFrequencies: ${node.reportInterval}/${node.reportUnits} | clock=${node.alignToClock} | topic=${node.topicKey} | value=${node.valueKey}`);

        function measure() {

          console.log(`TopicFrequencies: ${new Date()} > ${node.interval} | ${node.units}`);

          nodeCycles++;

          msg = {};
          msg.topics = {};
          // msg.metricValues = metricValues;

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
            msg.topics[key].sum = count;
            msg.topics[key].avg = count / messageCount;
            msg.topics[key].min = min;
            msg.topics[key].max = max;
            msg.topics[key].elements = messageCount;

            // interval metrics cross-topics
            topicsIntervalCount += count;
            topicsIntervalMessageCount += messageCount;
            if(topicsIntervalCountMin == undefined) topicsIntervalCountMin = min;
            topicsIntervalCountMin = Math.min(topicsIntervalCountMin, min);
            if(topicsIntervalCountMax == undefined) topicsIntervalCountMax = max;
            topicsIntervalCountMax = Math.max(topicsIntervalCountMax, max);
          };
          
          msg.topics['<all>'] = {}
          msg.topics['<all>'].sum = topicsIntervalCount;
          msg.topics['<all>'].avg = topicsIntervalCount / topicsIntervalMessageCount;
          msg.topics['<all>'].min = topicsIntervalCountMin;
          msg.topics['<all>'].max = topicsIntervalCountMax;
          msg.topics['<all>'].elements = topicsIntervalMessageCount;

          // update cache
          tempGlobal = msg.topics['<all>'];

          msg.cycles = nodeCycles;
          msg.interval = parseInt(node.interval);
          msg.units = node.units;
          msg.topicKey = node.topicKey;
          msg.valueKey = node.valueKey;
          msg.alignToClock = node.alignToClock;
          
          node.send([msg, null]);
          showCount();
        }

        function reset() {
          metricValues = {};
          nodeCycles = 0;
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
          node.status({ fill: "green", shape: "dot", text: `${tempGlobal.sum} / ${tempGlobal.elements}` });
        };

        function isSet(object, string) {
          if (!object) return false;
          var childs = string.split('.');
          if(childs.length == 1) {
            return (object[childs[0]] != undefined);
          } else {
            return isSet(object[childs[0]], string.substring(childs[0].length+1));
          }
        }

        function resolve(object, string) {
          if (!object) return undefined;
          var childs = string.split('.');
          if(childs.length == 1) {
            return object[childs[0]]; // maybe undefined
          } else {
            return resolve(object[childs[0]], string.substring(childs[0].length+1));
          }
        }

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
            topic = resolve(msg, node.topicKey);
            if(topic==undefined) {
              if(msg.topic==undefined) 
                topic="NaN";
              else
                topic=msg.topic;
            }

            var value = resolve(msg, node.valueKey);
            if(value == undefined || isNaN(value)) {
              // fallback to msg.payload
              if(msg.payload == undefined || isNaN(msg.payload)) 
                value = 1; // fallback to 1
              else
                value = Number(value);
            }
            
            if (metricValues[topic]==undefined) {
              var interval = intervalToMs(node.units, node.interval);
              metricValues[topic] = ExpireArray(interval);
            }
            
            metricValues[topic].push(value);

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
