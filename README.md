# CMS Neso (Sao Worker)

A worker manager that orbits around [CMS](https://github.com/cms-dev/cms),
transforming every `cms-sao` action requests into a CMS specific payload.

## Up and running

CMS Neso can be deployed and run as a Docker container or a node.js application;
either way is recommend to run this application as the former one.

### Prerequisites

CMS Neso heavily relies on [CMS](https://github.com/cms-dev/cms) including its database, so
in order to have this application up and running you will need:

1. CMS 1.3.x or greater (the current Neso version was designed against the last CMS revision in Jan 2018)
2. MongoDB as message queue
3. Docker engine 17.x or greater

### Deployment

CMS Neso can be deployed and run as a Docker container, it can be done in a
terminal like this:

```shell
docker container run cmsorbits/cms-neso
```

Or it can be run using `docker-compose up` with a `docker-compose.yml` file
similar to the one on the project root.

### Configuration

All the intrinsic configurations can be overridden via `.yml` files within the
`config/` following [node-config](https://github.com/lorenwest/node-config)
conventions (use `config/default.yml` as guide) or via environment variables
using the `NESO_` prefix for each value. For example in order to override the
`mongo.host` value, you could start the Docker container with the following
syntax:

```shell
docker container run -p 8000:8000 -e 'NESO_MONGO_HOST=10.10.37.10' cmsorbits/cms-neso
```

If you are running Neso as container with `docker-compose` the override values
can be provided directly in the `docker-compose.yml` or
`docker-compose.override.yml` files using the [environment](https://docs.docker.com/compose/compose-file/#environment)
block.

The most relevant properties are:

Property name | Default value | Description
--- | --- | ---
cms.url | http://localhost | CMS URL
cms.secret | 8e045a51e4b102ea803c06f92841a1fb | Secret text used to hash CMS encrypted values
mongo.user | cmsuser | MongoDB datasource username
mongo.pswd | | MongoDB datasource password
mongo.host | 127.0.0.1 | MongoDB host network address
mongo.port | 27017 | MongoDB port
mongo.schema | cmsdb | MongoDB database name
queue.name | neso_queue | Message queue name
worker.poll.frequency | 200 | How often the worker will poll CMS to track changestime in milliseconds
worker.pool.limit | 10 | Amount of workers to process queue

## License

This project is licensed under the **MIT License** - see the [LICENSE](LICENSE)
file for details.
