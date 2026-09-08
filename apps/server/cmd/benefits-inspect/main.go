// Command benefits-inspect prints what a government PDF actually contains:
// every form field, its type, the page it sits on, its rectangle, and the exact
// values a choice field will accept.
//
// It is the starting point for writing a mapping file, and the way to check one
// against a form a state has just reissued. It reads a PDF and prints; it never
// writes, and it never touches applicant data.
//
//	go run ./cmd/benefits-inspect path/to/form.pdf
//	go run ./cmd/benefits-inspect -json path/to/form.pdf
package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"text/tabwriter"

	"github.com/helpthehive/server/internal/modules/benefits/pdf"
)

func main() {
	asJSON := flag.Bool("json", false, "print the inventory as JSON")
	flag.Parse()

	if flag.NArg() != 1 {
		fmt.Fprintln(os.Stderr, "usage: benefits-inspect [-json] <form.pdf>")
		os.Exit(2)
	}

	file, err := os.Open(flag.Arg(0))
	if err != nil {
		fail(err)
	}
	defer file.Close()

	inventory, err := pdf.Inspect(file)
	if err != nil {
		fail(err)
	}

	if *asJSON {
		encoder := json.NewEncoder(os.Stdout)
		encoder.SetIndent("", "  ")
		if err := encoder.Encode(inventory); err != nil {
			fail(err)
		}
		return
	}

	fmt.Printf("%s\n", flag.Arg(0))
	fmt.Printf("  pages:       %d\n", inventory.PageCount)
	fmt.Printf("  fillable:    %t\n", inventory.HasAcroForm)
	fmt.Printf("  page sizes:  ")
	for i, size := range inventory.PageSizes {
		if i > 0 {
			fmt.Print(", ")
		}
		fmt.Printf("%.0fx%.0f", size.W, size.H)
	}
	fmt.Println()

	if !inventory.HasAcroForm {
		fmt.Println("\nThis form has no fields. It needs a flat mapping with coordinates;")
		fmt.Println("rectangles are in points with the page's bottom-left corner as the origin.")
		return
	}

	fmt.Printf("\n%d fields:\n\n", len(inventory.Fields))
	out := tabwriter.NewWriter(os.Stdout, 2, 2, 2, ' ', 0)
	fmt.Fprintln(out, "NAME\tTYPE\tPAGE\tRECT (x y w h)\tPRINTED LABEL\tOPTIONS")
	for _, field := range inventory.Fields {
		for i, widget := range field.Widgets {
			name, kind := field.Name, string(field.Type)
			if i > 0 {
				name, kind = "", ""
			}
			options := ""
			if i == 0 && len(field.Options) > 0 {
				options = fmt.Sprintf("%v", field.Options)
			}
			if widget.OnState != "" {
				options += " on=" + widget.OnState
			}
			label := ""
			if i == 0 {
				label = field.Label
				if label != "" && field.LabelPlacement == "above" {
					label = "^ " + label
				}
			}
			fmt.Fprintf(out, "%s\t%s\t%d\t%.1f %.1f %.1f %.1f\t%s\t%s\n",
				name, kind, widget.Page,
				widget.Rect.X, widget.Rect.Y, widget.Rect.W, widget.Rect.H, label, options)
		}
	}
	out.Flush()
}

func fail(err error) {
	fmt.Fprintln(os.Stderr, "benefits-inspect:", err)
	os.Exit(1)
}
