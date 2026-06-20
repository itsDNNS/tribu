from pathlib import Path

import yaml


ROOT = Path(__file__).resolve().parents[1]
WORKFLOWS = ROOT / '.github/workflows'


def test_e2e_workflow_declares_read_only_permissions():
    workflow_text = (WORKFLOWS / 'e2e.yml').read_text()
    workflow = yaml.safe_load(workflow_text)

    assert workflow['permissions'] == {'contents': 'read'}
    assert workflow_text.index('\npermissions:\n') < workflow_text.index('\njobs:\n')


def test_e2e_workflow_delegates_server_lifecycle_to_playwright():
    workflow_text = (WORKFLOWS / 'e2e.yml').read_text()
    workflow = yaml.safe_load(workflow_text)
    steps = workflow['jobs']['e2e']['steps']
    step_names = [step.get('name', '') for step in steps]
    run_step = next(step for step in steps if step.get('name') == 'Run E2E tests')

    assert 'Start services' not in step_names
    assert 'Wait for backend health' not in step_names
    assert 'Wait for frontend' not in step_names
    assert 'Teardown' not in step_names
    assert 'for i in $(seq' not in workflow_text
    assert 'curl -sf http://localhost' not in workflow_text
    assert run_step['run'] == 'npx playwright test'
    assert run_step['env']['BASE_URL'] == 'http://localhost:3000'
    assert run_step['env']['E2E_WEB_SERVER_URL'] == 'http://localhost:3000'
    assert run_step['env']['E2E_BACKEND_HEALTH_URL'] == 'http://localhost:8000/health'
    assert 'docker-compose.dev.yml' in run_step['env']['E2E_WEB_SERVER_COMMAND']
    assert 'up --build' in run_step['env']['E2E_WEB_SERVER_COMMAND']


def test_e2e_workflow_keeps_failure_artifacts():
    workflow = yaml.safe_load((WORKFLOWS / 'e2e.yml').read_text())
    steps = workflow['jobs']['e2e']['steps']
    report_step = next(step for step in steps if step.get('name') == 'Upload test report')
    trace_step = next(step for step in steps if step.get('name') == 'Upload traces on failure')

    assert report_step['if'] == 'always()'
    assert report_step['with']['path'] == 'frontend/playwright-report/'
    assert trace_step['if'] == 'failure()'
    assert trace_step['with']['path'] == 'frontend/test-results/'


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
