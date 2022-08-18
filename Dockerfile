FROM node:12-alpine
RUN mkdir -p /home/node/app/node_modules && chown -R node:node /home/node/app
WORKDIR /home/node/app
COPY package.json .
COPY tsconfig.json .
COPY tslint.json .
COPY --chown=node:node src/*.ts .
RUN npm config set strict-ssl false
RUN npm install
RUN npm install -g typescript
RUN tsc cmdutil.ts; exit 0

ARG offline_dl_port=3000
ENV ofdl_port=$offline_dl_port
ARG offline_dl_bot="http://host.docker.internal:5019/api/messages"
ENV ofdl_bot=$offline_dl_bot
ENV ofdl_git="https://github.com/abozaralizadeh/offline-directline"

EXPOSE $ofdl_port
CMD ["sh", "-c", "node cmdutil.js -d $ofdl_port -b $ofdl_bot"]