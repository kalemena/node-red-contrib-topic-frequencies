FROM kalemena/node-red:latest

COPY --chown=nodered:nodered [ "package*.json", "topic-frequencies.*", "LICENSE", "examples", "/opt/node-red-contrib-topic-frequencies/" ]
RUN cd /opt/node-red-contrib-topic-frequencies \
  && rm package-lock.json \
  && npm install \
  && cd /opt/node-red \
  && npm i \
        /opt/node-red-contrib-topic-frequencies

# RUN npm i node-red-contrib-topic-frequencies