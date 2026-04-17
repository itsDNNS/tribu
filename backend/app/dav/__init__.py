"""CalDAV and CardDAV server for Tribu.

Wraps Radicale (https://radicale.org) as an embedded WSGI application,
mounted under ``/dav`` on the FastAPI app. Authentication is Personal
Access Token based so standard DAV clients (iOS Calendar/Contacts,
DAVx5) can authenticate via HTTP Basic Auth.

Phase A: Radicale is configured with its default multi-file-system
storage so the plumbing can be exercised end-to-end. A proper
database-backed storage plugin that projects Tribu's events/contacts
tables replaces it in Phase B (CalDAV) and Phase C (CardDAV).
"""
