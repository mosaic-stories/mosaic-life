{{/*
Expand the name of the chart.
*/}}
{{- define "mosaic-life.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create a default fully qualified app name.
*/}}
{{- define "mosaic-life.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{/*
Create chart name and version as used by the chart label.
*/}}
{{- define "mosaic-life.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Common labels
*/}}
{{- define "mosaic-life.labels" -}}
helm.sh/chart: {{ include "mosaic-life.chart" . }}
{{ include "mosaic-life.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
environment: {{ .Values.global.environment }}
{{- end }}

{{/*
Selector labels
*/}}
{{- define "mosaic-life.selectorLabels" -}}
app.kubernetes.io/name: {{ include "mosaic-life.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/*
Web selector labels
*/}}
{{- define "mosaic-life.web.selectorLabels" -}}
app: {{ .Values.web.name }}
app.kubernetes.io/name: {{ .Values.web.name }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/component: frontend
{{- end }}

{{/*
Core API selector labels
*/}}
{{- define "mosaic-life.coreApi.selectorLabels" -}}
app: {{ .Values.coreApi.name }}
app.kubernetes.io/name: {{ .Values.coreApi.name }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/component: backend
{{- end }}

{{/*
Image pull policy
*/}}
{{- define "mosaic-life.imagePullPolicy" -}}
{{- if eq .Values.global.environment "prod" }}
{{- "IfNotPresent" }}
{{- else }}
{{- "Always" }}
{{- end }}
{{- end }}

{{/*
Certificate ARN annotation
*/}}
{{- define "mosaic-life.certificateArn" -}}
{{- if .Values.global.aws.certificateArn }}
{{- .Values.global.aws.certificateArn }}
{{- else }}
{{- printf "arn:aws:acm:%s:%s:certificate/CERTIFICATE_ID" .Values.global.aws.region .Values.global.aws.accountId }}
{{- end }}
{{- end }}
