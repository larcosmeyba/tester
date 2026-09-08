package main

import (
	"fmt"
	"os"

	"github.com/pdfcpu/pdfcpu/pkg/api"
	"github.com/pdfcpu/pdfcpu/pkg/pdfcpu/form"
	"github.com/pdfcpu/pdfcpu/pkg/pdfcpu/model"
	"github.com/pdfcpu/pdfcpu/pkg/pdfcpu/types"
)

// Can a read that drops the document-info dictionary get past validation?
func main() {
	for _, path := range os.Args[1:] {
		fmt.Printf("\n=== %s\n", path)
		f, err := os.Open(path)
		if err != nil {
			fmt.Println("  open:", err)
			continue
		}
		conf := model.NewDefaultConfiguration()
		conf.ValidationMode = model.ValidationRelaxed
		ctx, err := api.ReadContext(f, conf)
		f.Close()
		if err != nil {
			fmt.Println("  ReadContext:", trunc(err))
			continue
		}

		before := ctx.XRefTable.Info
		dropped := dropInfo(ctx)
		fmt.Printf("  info present=%v dropped=%d entries\n", before != nil, dropped)

		if err := api.ValidateContext(ctx); err != nil {
			fmt.Println("  ValidateContext:", trunc(err))
			continue
		}
		if err := api.OptimizeContext(ctx); err != nil {
			fmt.Println("  OptimizeContext:", trunc(err))
			continue
		}
		fields := 0
		if ctx.XRefTable.Form != nil {
			if fs, err := form.Fields(ctx.XRefTable); err == nil {
				fields = len(fs)
			}
		}
		fmt.Printf("  OK pages=%d acroform=%v topLevelFields=%d\n",
			ctx.XRefTable.PageCount, ctx.XRefTable.Form != nil, fields)
	}
}

// dropInfo removes the document information dictionary. It holds a title, an
// author and whatever a word processor decided to stamp in; none of it affects
// a form's fields, and a malformed entry in it is not a reason to refuse to
// read somebody's benefits application.
func dropInfo(ctx *model.Context) int {
	xRefTable := ctx.XRefTable
	if xRefTable.Info == nil {
		return 0
	}
	dict, err := xRefTable.DereferenceDict(*xRefTable.Info)
	count := 0
	if err == nil && dict != nil {
		count = len(dict)
		for key := range dict {
			delete(dict, key)
		}
		dict["Producer"] = types.StringLiteral("Help The Hive")
	}
	return count
}

func trunc(err error) string {
	s := err.Error()
	if len(s) > 130 {
		s = s[:130]
	}
	return s
}
