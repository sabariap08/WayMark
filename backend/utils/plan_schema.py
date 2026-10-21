"""Plan schema validation for AI Event Co-Pilot."""
from datetime import datetime
from typing import Any, Dict, List, Tuple


def _get_path(errors: List[Dict[str, Any]], warnings: List[Dict[str, Any]], path: str):
    def add_err(msg: str):
        errors.append({"path": path, "message": msg})

    def add_warn(msg: str):
        warnings.append({"path": path, "message": msg})

    return add_err, add_warn


def _parse_date(s: Any, path: str, errors: List[Dict[str, Any]], warnings: List[Dict[str, Any]]):
    if s is None or s == "":
        _get_path(errors, warnings, path)[0]("is required")
        return None
    if not isinstance(s, str):
        _get_path(errors, warnings, path)[0]("must be a string in YYYY-MM-DD format")
        return None
    try:
        dt = datetime.strptime(s.strip(), "%Y-%m-%d")
        return dt
    except ValueError:
        _get_path(errors, warnings, path)[0]("must be a string in YYYY-MM-DD format")
        return None


def _parse_time(s: Any, path: str, errors: List[Dict[str, Any]], warnings: List[Dict[str, Any]]):
    if s is None or s == "":
        _get_path(errors, warnings, path)[0]("is required")
        return None
    if not isinstance(s, str):
        _get_path(errors, warnings, path)[0]("must be HH:MM")
        return None
    v = s.strip()
    try:
        dt = datetime.strptime(v, "%H:%M")
        return dt
    except ValueError:
        _get_path(errors, warnings, path)[0]("must be HH:MM")
        return None


def _int_geq(v: Any, path: str, errors: List[Dict[str, Any]], warnings: List[Dict[str, Any]], minv: int = 0, required: bool = False):
    if v is None or v == "":
        if required:
            _get_path(errors, warnings, path)[0]("is required")
        return None
    # accept int or str numbers
    try:
        if isinstance(v, bool):
            raise ValueError
        if isinstance(v, int):
            iv = v
        elif isinstance(v, str):
            # strip non-digit chars except - if present? but expected non-negative
            s = v.strip()
            # handle commas/rupees formatting? schema expects raw numbers in structure, but be strict
            iv = int(s) if s.lstrip("-+").isdigit() else int(float(s))
        else:
            iv = int(v)
    except Exception:
        _get_path(errors, warnings, path)[0]("must be an integer")
        return None
    if iv < minv:
        _get_path(errors, warnings, path)[0](f"must be >= {minv}")
        return None
    return iv


def validate_plan(plan: Dict[str, Any]) -> Dict[str, Any]:
    errors: List[Dict[str, Any]] = []
    warnings: List[Dict[str, Any]] = []

    if not isinstance(plan, dict):
        return {"valid": False, "errors": [{"path": "", "message": "plan must be an object"}], "warnings": []}

    # top level
    title = plan.get("title")
    if not isinstance(title, str) or not title.strip():
        errors.append({"path": "title", "message": "is required"})
    else:
        plan["title"] = title.strip()

    desc = plan.get("description")
    if desc is not None and not isinstance(desc, str):
        errors.append({"path": "description", "message": "must be a string"})
    elif isinstance(desc, str):
        plan["description"] = desc

    cat = plan.get("category")
    if cat is not None and not isinstance(cat, str):
        errors.append({"path": "category", "message": "must be a string"})

    fmt = plan.get("format")
    if fmt is not None:
        if fmt not in ("Online", "Offline", "Hybrid"):
            errors.append({"path": "format", "message": "must be one of Online, Offline, Hybrid"})
    else:
        plan["format"] = "Offline"

    loc = plan.get("location")
    if loc is not None and not isinstance(loc, str):
        errors.append({"path": "location", "message": "must be a string"})

    city = plan.get("city")
    if city is not None and not isinstance(city, str):
        errors.append({"path": "city", "message": "must be a string"})

    start_dt = _parse_date(plan.get("startDate"), "startDate", errors, warnings)
    end_dt = _parse_date(plan.get("endDate"), "endDate", errors, warnings)
    if start_dt and end_dt and end_dt < start_dt:
        errors.append({"path": "endDate", "message": "endDate must be >= startDate"})

    days = _int_geq(plan.get("days"), "days", errors, warnings, minv=1, required=True)
    participants = _int_geq(plan.get("participants"), "participants", errors, warnings, minv=1, required=True)
    budget_minor = _int_geq(plan.get("budgetMinor"), "budgetMinor", errors, warnings, minv=0, required=True)
    currency = plan.get("currency")
    if currency is not None:
        if not isinstance(currency, str) or len(currency) != 3:
            errors.append({"path": "currency", "message": "must be a 3-letter ISO code"})
        else:
            plan["currency"] = currency.upper()
    else:
        plan["currency"] = "INR"

    # registrationCategories
    regcats = plan.get("registrationCategories")
    if regcats is not None:
        if not isinstance(regcats, list):
            errors.append({"path": "registrationCategories", "message": "must be an array"})
        else:
            for i, rc in enumerate(regcats):
                if not isinstance(rc, dict):
                    errors.append({"path": f"registrationCategories[{i}]", "message": "must be an object"})
                    continue
                name = rc.get("name")
                if not isinstance(name, str) or not name.strip():
                    errors.append({"path": f"registrationCategories[{i}].name", "message": "is required"})
                else:
                    rc["name"] = name.strip()
                fee = _int_geq(rc.get("feeMinor"), f"registrationCategories[{i}].feeMinor", errors, warnings, minv=0, required=True)

    # schedule
    schedule = plan.get("schedule")
    if schedule is not None:
        if not isinstance(schedule, list):
            errors.append({"path": "schedule", "message": "must be an array"})
        else:
            for i, s in enumerate(schedule):
                if not isinstance(s, dict):
                    errors.append({"path": f"schedule[{i}]", "message": "must be an object"})
                    continue
                sd = _int_geq(s.get("day"), f"schedule[{i}].day", errors, warnings, minv=1)
                st = _parse_time(s.get("startTime"), f"schedule[{i}].startTime", errors, warnings)
                et = _parse_time(s.get("endTime"), f"schedule[{i}].endTime", errors, warnings)
                title_s = s.get("title")
                if title_s is not None and not isinstance(title_s, str):
                    errors.append({"path": f"schedule[{i}].title", "message": "must be a string"})
                elif isinstance(title_s, str):
                    s["title"] = title_s.strip()
                stype = s.get("type")
                if stype is not None and not isinstance(stype, str):
                    errors.append({"path": f"schedule[{i}].type", "message": "must be a string"})
                if st and et and et <= st:
                    errors.append({"path": f"schedule[{i}].endTime", "message": "endTime must be > startTime"})
                # days inside range
                if start_dt and end_dt and isinstance(sd, int):
                    total_days = (end_dt - start_dt).days + 1
                    if sd < 1 or sd > total_days:
                        warnings.append({"path": f"schedule[{i}].day", "message": "day is outside event range"})

    # activities
    activities = plan.get("activities")
    if activities is not None:
        if not isinstance(activities, list):
            errors.append({"path": "activities", "message": "must be an array"})
        else:
            for i, a in enumerate(activities):
                if not isinstance(a, dict):
                    errors.append({"path": f"activities[{i}]", "message": "must be an object"})
                    continue
                title_a = a.get("title")
                if title_a is not None and not isinstance(title_a, str):
                    errors.append({"path": f"activities[{i}].title", "message": "must be a string"})
                atype = a.get("type")
                if atype is not None and not isinstance(atype, str):
                    errors.append({"path": f"activities[{i}].type", "message": "must be a string"})
                ad = _int_geq(a.get("day"), f"activities[{i}].day", errors, warnings, minv=1)
                ast = _parse_time(a.get("startTime"), f"activities[{i}].startTime", errors, warnings)
                aet = _parse_time(a.get("endTime"), f"activities[{i}].endTime", errors, warnings)
                if ast and aet and aet <= ast:
                    errors.append({"path": f"activities[{i}].endTime", "message": "endTime must be > startTime"})
                exp = a.get("expectedParticipants")
                if exp is not None:
                    _int_geq(exp, f"activities[{i}].expectedParticipants", errors, warnings, minv=0)

    # expenses
    expenses = plan.get("expenses")
    if expenses is not None:
        if not isinstance(expenses, list):
            errors.append({"path": "expenses", "message": "must be an array"})
        else:
            for i, e in enumerate(expenses):
                if not isinstance(e, dict):
                    errors.append({"path": f"expenses[{i}]", "message": "must be an object"})
                    continue
                cat_e = e.get("category")
                if cat_e is not None and not isinstance(cat_e, str):
                    errors.append({"path": f"expenses[{i}].category", "message": "must be a string"})
                amt = _int_geq(e.get("amountMinor"), f"expenses[{i}].amountMinor", errors, warnings, minv=0, required=True)

    # resources
    resources = plan.get("resources")
    if resources is not None:
        if not isinstance(resources, list):
            errors.append({"path": "resources", "message": "must be an array"})
        else:
            for i, r in enumerate(resources):
                if not isinstance(r, dict):
                    errors.append({"path": f"resources[{i}]", "message": "must be an object"})
                    continue
                name_r = r.get("name")
                if name_r is not None and not isinstance(name_r, str):
                    errors.append({"path": f"resources[{i}].name", "message": "must be a string"})
                kind_r = r.get("kind")
                if kind_r is not None and not isinstance(kind_r, str):
                    errors.append({"path": f"resources[{i}].kind", "message": "must be a string"})
                qty = r.get("quantity")
                if qty is not None:
                    _int_geq(qty, f"resources[{i}].quantity", errors, warnings, minv=0)

    # volunteerRoles
    vroles = plan.get("volunteerRoles")
    if vroles is not None:
        if not isinstance(vroles, list):
            errors.append({"path": "volunteerRoles", "message": "must be an array"})
        else:
            for i, vr in enumerate(vroles):
                if not isinstance(vr, dict):
                    errors.append({"path": f"volunteerRoles[{i}]", "message": "must be an object"})
                    continue
                role = vr.get("role")
                if role is not None and not isinstance(role, str):
                    errors.append({"path": f"volunteerRoles[{i}].role", "message": "must be a string"})
                count = _int_geq(vr.get("count"), f"volunteerRoles[{i}].count", errors, warnings, minv=0, required=True)
                skills = vr.get("skills")
                if skills is not None and not isinstance(skills, list):
                    errors.append({"path": f"volunteerRoles[{i}].skills", "message": "must be an array"})

    # tasks
    tasks = plan.get("tasks")
    if tasks is not None:
        if not isinstance(tasks, list):
            errors.append({"path": "tasks", "message": "must be an array"})
        else:
            for i, t in enumerate(tasks):
                if not isinstance(t, dict):
                    errors.append({"path": f"tasks[{i}]", "message": "must be an object"})
                    continue
                title_t = t.get("title")
                if title_t is not None and not isinstance(title_t, str):
                    errors.append({"path": f"tasks[{i}].title", "message": "must be a string"})
                dueday = _int_geq(t.get("dueDay"), f"tasks[{i}].dueDay", errors, warnings, minv=0, required=True)
                pr = t.get("priority")
                if pr is not None and not isinstance(pr, str):
                    errors.append({"path": f"tasks[{i}].priority", "message": "must be a string"})

    # checklist
    checklist = plan.get("checklist")
    if checklist is not None:
        if not isinstance(checklist, list):
            errors.append({"path": "checklist", "message": "must be an array"})
        else:
            for i, c in enumerate(checklist):
                if not isinstance(c, dict):
                    errors.append({"path": f"checklist[{i}]", "message": "must be an object"})
                    continue
                label = c.get("label")
                if label is not None and not isinstance(label, str):
                    errors.append({"path": f"checklist[{i}].label", "message": "must be a string"})
                dueday = _int_geq(c.get("dueDay"), f"checklist[{i}].dueDay", errors, warnings, minv=0)

    # communications
    comms = plan.get("communications")
    if comms is not None:
        if not isinstance(comms, list):
            errors.append({"path": "communications", "message": "must be an array"})
        else:
            for i, cm in enumerate(comms):
                if not isinstance(cm, dict):
                    errors.append({"path": f"communications[{i}]", "message": "must be an object"})
                    continue
                ctype = cm.get("type")
                if ctype is not None and not isinstance(ctype, str):
                    errors.append({"path": f"communications[{i}].type", "message": "must be a string"})
                aud = cm.get("audience")
                if aud is not None and not isinstance(aud, str):
                    errors.append({"path": f"communications[{i}].audience", "message": "must be a string"})
                subj = cm.get("subject")
                if subj is not None and not isinstance(subj, str):
                    errors.append({"path": f"communications[{i}].subject", "message": "must be a string"})
                body = cm.get("body")
                if body is not None and not isinstance(body, str):
                    errors.append({"path": f"communications[{i}].body", "message": "must be a string"})

    # sponsors
    sponsors = plan.get("sponsors")
    if sponsors is not None:
        if not isinstance(sponsors, list):
            errors.append({"path": "sponsors", "message": "must be an array"})
        else:
            for i, sp in enumerate(sponsors):
                if not isinstance(sp, dict):
                    errors.append({"path": f"sponsors[{i}]", "message": "must be an object"})
                    continue
                pkg = sp.get("package")
                if pkg is not None and not isinstance(pkg, str):
                    errors.append({"path": f"sponsors[{i}].package", "message": "must be a string"})
                ask = _int_geq(sp.get("askingMinor"), f"sponsors[{i}].askingMinor", errors, warnings, minv=0)

    # warnings
    if budget_minor is not None:
        total_exp = 0
        if isinstance(expenses, list):
            for e in expenses:
                if isinstance(e, dict):
                    amt = _int_geq(e.get("amountMinor"), "exp", [], [], minv=0)
                    if amt:
                        total_exp += amt
        if total_exp > budget_minor:
            warnings.append({"path": "budgetMinor", "message": "total expenses > budget"})

    if schedule and isinstance(schedule, list) and len(schedule) >= 2:
        # simple check for large gaps? optional; just note
        pass

    return {"valid": len(errors) == 0, "errors": errors, "warnings": warnings}
