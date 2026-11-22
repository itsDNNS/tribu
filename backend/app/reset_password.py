"""Give one account a temporary password from the server shell.

The way back in when nobody can reset it in the app, for example the only
admin forgot their password. It asks for the temporary password, so the
password never appears in the terminal output or logs:

    docker exec -it <backend-container> python -m app.reset_password <email>
"""
import getpass
import sys

from app.core.auth_sessions import set_temporary_password
from app.database import SessionLocal
from app.models import User


def reset_password(email: str, temporary: str) -> bool:
    """Return False if no account uses ``email``."""
    with SessionLocal() as db:
        user = db.query(User).filter(User.email == email.strip().lower()).first()
        if user is None:
            return False
        set_temporary_password(db, user, temporary)
        db.commit()
        return True


def main(argv: list[str]) -> int:
    if len(argv) != 1:
        print("Usage: python -m app.reset_password <email>", file=sys.stderr)
        return 2
    temporary = getpass.getpass(f"Temporary password for {argv[0]}: ")
    if not temporary:
        print("No password given", file=sys.stderr)
        return 2
    if not reset_password(argv[0], temporary):
        print(f"No account with email {argv[0]}", file=sys.stderr)
        return 1
    print("Done. They must change it at their next sign-in. All their sessions were ended.")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
