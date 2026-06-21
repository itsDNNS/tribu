import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
WORKFLOWS = ROOT / '.github/workflows'


def read_e2e_workflow():
    return (WORKFLOWS / 'e2e.yml').read_text()


def named_step_block(workflow_text, step_name):
    match = re.search(
        rf'(?m)^      - name: {re.escape(step_name)}\n(?P<body>(?:        .*\n)*)',
        workflow_text,
    )
    assert match is not None, f'Missing workflow step: {step_name}'
    return match.group('body')


def test_e2e_workflow_declares_read_only_permissions():
    workflow_text = read_e2e_workflow()
    permissions = re.search(r'(?m)^permissions:\n(?P<body>(?:  [^\n]+\n)+)', workflow_text)

    assert permissions is not None
    assert permissions.group('body') == '  contents: read\n'
    assert workflow_text.index('\npermissions:\n') < workflow_text.index('\njobs:\n')


def test_e2e_workflow_delegates_server_lifecycle_to_playwright():
    workflow_text = read_e2e_workflow()
    run_step = named_step_block(workflow_text, 'Run E2E tests')

    assert '      - name: Start services\n' not in workflow_text
    assert '      - name: Wait for backend health\n' not in workflow_text
    assert '      - name: Wait for frontend\n' not in workflow_text
    assert '      - name: Teardown\n' not in workflow_text
    assert 'for i in $(seq' not in workflow_text
    assert 'curl -sf http://localhost' not in workflow_text
    assert '        run: npx playwright test\n' in run_step
    assert '          BASE_URL: http://localhost:3000\n' in run_step
    assert '          E2E_WEB_SERVER_URL: http://localhost:3000\n' in run_step
    assert '          E2E_BACKEND_HEALTH_URL: http://localhost:8000/health\n' in run_step
    assert '          E2E_WEB_SERVER_COMMAND:' in run_step
    assert 'docker-compose.dev.yml' in run_step
    assert 'up --build' in run_step


def test_e2e_workflow_keeps_failure_artifacts():
    workflow_text = read_e2e_workflow()
    report_step = named_step_block(workflow_text, 'Upload test report')
    trace_step = named_step_block(workflow_text, 'Upload traces on failure')

    assert '        if: always()\n' in report_step
    assert '          path: frontend/playwright-report/\n' in report_step
    assert '        if: failure()\n' in trace_step
    assert '          path: frontend/test-results/\n' in trace_step


def test_playwright_config_owns_optional_web_server_lifecycle():
    config = (ROOT / 'frontend/playwright.config.js').read_text()
    local_runner = (ROOT / 'scripts/e2e-local.sh').read_text()
    local_services = (ROOT / 'scripts/e2e-local-services.sh').read_text()

    assert 'const webServerCommand = process.env.E2E_WEB_SERVER_COMMAND;' in config
    assert 'webServer:' in config
    assert 'url: webServerURL' in config
    assert 'timeout: 300 * 1000' in config
    assert "baseURL," in config
    assert 'E2E_WEB_SERVER_COMMAND="../scripts/e2e-local-services.sh"' in local_runner
    assert 'E2E_BACKEND_HEALTH_URL="$BACKEND_URL/health"' in local_runner
    assert 'npx playwright test "$@"' in local_runner
    assert 'wait_for_url "$BACKEND_URL/health" "backend"' in local_services
    assert 'npx next dev -p "$FRONTEND_PORT"' in local_services


def test_playwright_global_setup_waits_for_backend_health_when_configured():
    global_setup = (ROOT / 'frontend/e2e/global-setup.js').read_text()

    assert 'async function waitForHealth' in global_setup
    assert 'process.env.E2E_BACKEND_HEALTH_URL' in global_setup
    assert 'E2E_BACKEND_HEALTH_TIMEOUT_MS' in global_setup
    assert 'await waitForHealth(process.env.E2E_BACKEND_HEALTH_URL, timeoutMs);' in global_setup
