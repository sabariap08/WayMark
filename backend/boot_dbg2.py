import traceback
try:
    from app import create_app
    a = create_app()
    print('ok')
except Exception as e:
    traceback.print_exc()
