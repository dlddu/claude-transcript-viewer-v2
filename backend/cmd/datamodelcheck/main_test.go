package main

import "testing"

func TestRepositoryErdMatchesSchema(t *testing.T) {
	rep, err := run("../../..")
	if err != nil {
		t.Fatalf("run: %v", err)
	}
	for _, v := range rep.Violations {
		if v.Invariant == 1 {
			t.Errorf("invariant 1 violated: %s %s (expected %s)", v.Kind, v.Item, v.Expected)
		}
	}
	if rep.Tables == 0 {
		t.Fatal("no tables observed")
	}
}

func TestParseScopeRejectsMissingBlock(t *testing.T) {
	if _, err := parseScope("# no block here\n"); err == nil {
		t.Fatal("want error for README without data-model-scope block")
	}
}
