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