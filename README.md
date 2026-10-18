# notes-api

A small notes app. Express backend, Postgres for storage, plain HTML/JS frontend. Runs on Kubernetes (kind) with Helm, ships through GitHub Actions and is monitored with Prometheus.

- `src/index.js`: `/healthz` (liveness), `/readyz` (checks the DB), `/version` (build commit), `/metrics`, JSON logs, graceful shutdown
- `deploy/helm/notes-api`: app Deployment and NodePort Service, Postgres StatefulSet with PVC, NetworkPolicy for the DB, ServiceMonitor and alerts
- `.github/workflows/ci.yml`: test, build, scan, push; gated deploy on `v*` tags

## Run locally

Needs Docker Desktop, kind, kubectl, Helm 4 and Node 22. Install monitoring first, because the chart only creates its ServiceMonitor and alerts when the Prometheus CRDs exist.

```bash
kind create cluster --name notes --config deploy/kind.yaml

kubectl create namespace monitoring
kubectl -n monitoring create secret generic grafana-admin --from-literal=admin-user=admin --from-literal=admin-password=<pick one>
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm upgrade --install kps prometheus-community/kube-prometheus-stack -n monitoring -f deploy/monitoring.yaml --wait

kubectl create namespace notes
kubectl -n notes create secret generic notes-db --from-literal=username=notes --from-literal=password=<pick one> --from-literal=database=notes

SHA=$(git rev-parse HEAD)
docker build --build-arg GIT_SHA=$SHA -t ghcr.io/abhinavkrn/notes-api:$SHA .
kind load docker-image ghcr.io/abhinavkrn/notes-api:$SHA --name notes
helm upgrade --install notes-api deploy/helm/notes-api -n notes --set image.tag=$SHA --rollback-on-failure --wait
```

- App: http://localhost:8080, running commit at `/version`
- Grafana: `kubectl -n monitoring port-forward svc/kps-grafana 3000:80`
- Prometheus: `kubectl -n monitoring port-forward svc/kps-kube-prometheus-stack-prometheus 9090`
- Logs: `kubectl -n notes logs -l app=notes-api`
- Alerts: `NotesApiDown`, `NotesApiHighErrorRate` (over 5% 5xx), `NotesApiSlow` (p95 over 500ms)

## CI/CD and releases

Every push runs the tests, `npm audit` and `helm lint`, then builds the image tagged with the commit SHA, scans it with Trivy and pushes it to GHCR.

A `v*` tag also triggers `deploy`. It waits for approval on the `local` environment, then a self-hosted runner next to the kind cluster pulls the image, runs `helm upgrade --rollback-on-failure` and checks that `/version` matches the commit. GitHub setup needed: an environment `local` with a required reviewer, and a self-hosted Windows runner.

The rolling update uses `maxUnavailable: 0`, and pods that never become ready are rolled back automatically. For a manual rollback, use `helm history notes-api -n notes`, then `helm rollback notes-api <revision> -n notes`.

## Limitations

- Single-node kind; the node image is pinned to Kubernetes 1.34 because Docker Desktop here runs cgroup v1.
- One Postgres replica, no backups. No tracing or central log store.
- Deploys need the self-hosted runner online.
