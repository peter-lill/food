FROM python:3.12-slim

ARG MCP_REPOSITORY=https://github.com/iflow-mcp/hung-ngm-coles-woolworths-mcp-server.git
ARG MCP_REVISION=d8caf10985fd1dc1053b91fc3f3006e3100d974b

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    git ca-certificates novnc openbox socat websockify x11vnc xvfb \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /opt/grocery-mcp
RUN git clone "$MCP_REPOSITORY" upstream \
  && cd upstream \
  && git checkout "$MCP_REVISION"

RUN pip install --no-cache-dir fastmcp requests python-dotenv playwright \
  && playwright install --with-deps chromium

COPY services/grocery-mcp/bridge.py /opt/grocery-mcp/bridge.py
COPY services/grocery-mcp/coles_catalogue.py /opt/grocery-mcp/coles_catalogue.py
COPY services/grocery-mcp/woolworths_browser.py /opt/grocery-mcp/woolworths_browser.py
COPY services/grocery-mcp/THIRD_PARTY_NOTICES.md /opt/grocery-mcp/THIRD_PARTY_NOTICES.md

ENV PYTHONUNBUFFERED=1
ENV PORT=8787
EXPOSE 8787

CMD ["python", "/opt/grocery-mcp/bridge.py"]
