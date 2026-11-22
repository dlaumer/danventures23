import unittest
from unittest.mock import MagicMock, patch

from pydantic import ValidationError

import main


class NumberOfRidesTests(unittest.TestCase):
    def payload(self, **extra):
        return main.LocationIn(lng=8, lat=47, name="Zurich", transport="car",
                               travel_date="2026-11-22", pointtype="waypoint", **extra)

    def test_default_and_integer_validation(self):
        self.assertEqual(self.payload().number_of_rides, 1)
        self.assertEqual(self.payload(number_of_rides=4).number_of_rides, 4)
        for invalid in [0, -1, 1.5, True, "2", None, 2147483648]:
            with self.subTest(value=invalid), self.assertRaises(ValidationError):
                self.payload(number_of_rides=invalid)

    def test_create_and_update_persist_and_return_count(self):
        for operation in ["create", "update"]:
            with self.subTest(operation=operation), patch.object(main, "engine") as engine, \
                 patch.object(main, "rebuild_location_splice"), \
                 patch.object(main, "sync_legs_for_arriving_location"), \
                 patch.object(main, "remove_location_and_reconnect", return_value=True):
                conn = engine.begin.return_value.__enter__.return_value
                result = MagicMock()
                result.scalar_one.return_value = 7
                result.scalar_one_or_none.return_value = 7
                feature = {"properties": {"number_of_rides": 4}}
                read = MagicMock()
                read.scalar_one.return_value = feature
                conn.execute.side_effect = [result, read]
                payload = self.payload(number_of_rides=4)
                returned = (main.create_location(payload) if operation == "create"
                            else main.update_location(7, payload))
                statement, values = conn.execute.call_args_list[0].args
                self.assertIn(":number_of_rides", str(statement))
                self.assertEqual(values["number_of_rides"], 4)
                self.assertEqual(returned, feature)

    def test_collection_reads_include_count(self):
        with patch.object(main, "engine") as engine:
            main.locations()
            conn = engine.connect.return_value.__enter__.return_value
            self.assertIn("number_of_rides", str(conn.execute.call_args.args[0]))

    def test_startup_runs_backfill_default_and_constraint(self):
        with patch.object(main, "engine") as engine:
            main.ensure_location_schema()
            conn = engine.begin.return_value.__enter__.return_value
            migration = str(conn.execute.call_args_list[0].args[0])
            self.assertIn("SET number_of_rides = 1", migration)
            self.assertIn("SET DEFAULT 1", migration)
            self.assertIn("SET NOT NULL", migration)
            self.assertIn("CHECK (number_of_rides >= 1)", migration)


if __name__ == "__main__":
    unittest.main()
