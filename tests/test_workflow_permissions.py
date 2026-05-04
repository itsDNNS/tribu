from pathlib import Path

import yaml


WORKFLOWS = Path('.github/workflows')


def test_e2e_workflow_declares_read_only_permissions():
    workflow_text = (WORKFLOWS / 'e2e.yml').read_text()
    workflow = yaml.safe_load(workflow_text)

    assert workflow['permissions'] == {'contents': 'read'}
    assert workflow_text.index('\npermissions:\n') < workflow_text.index('\njobs:\n')
