FROM node:12-alpine

COPY . /opt/cms-neso
WORKDIR /opt/cms-neso

RUN set -x \
    && mkdir -p /opt/cms-neso \
    && chmod -R ugo+x /opt/cms-neso \
    && npm install --production

ENTRYPOINT ["docker-entrypoint.sh"]
CMD [ "node", "index.js" ]