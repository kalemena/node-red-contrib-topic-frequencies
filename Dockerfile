FROM kalemena/node-red:latest

COPY --chown=nodered:nodered [ "package*.json", "topic-frequencies.*", "LICENSE", "examples", "/opt/node-red-contrib-topic-frequencies/" ]

RUN npm i \
        /opt/node-red-contrib-topic-frequencies
