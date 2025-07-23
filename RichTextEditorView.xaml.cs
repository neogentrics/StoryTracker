namespace StoryTracker.MAUI
{
    public partial class RichTextEditorView : ContentView
    {
        public RichTextEditorView()
        {
            InitializeComponent();
            LoadEditor();
        }

        private void LoadEditor()
        {
            var htmlSource = new HtmlWebViewSource
            {
                // This HTML now uses the CDN links you found to load the Quill library.
                // NOTE: This requires an internet connection for the editor to load.
                Html = """
                <!DOCTYPE html>
                <html>
                <head>
                    <meta name="viewport" content="width=device-width, initial-scale=1">
                    <link href="https://cdn.jsdelivr.net/npm/quill@2/dist/quill.snow.css" rel="stylesheet">
                    <style>
                        body { margin: 0; padding: 0; font-family: sans-serif; }
                        #editor-container { height: 95vh; border: none; }
                        .ql-editor { font-size: 16px; }
                    </style>
                </head>
                <body>
                    <div id="editor-container"></div>
                    <script src="https://cdn.jsdelivr.net/npm/quill@2/dist/quill.js"></script>
                    <script>
                        var quill = new Quill('#editor-container', {
                            theme: 'snow'
                        });
                        // Function to get the editor's content for saving
                        function getHtml() {
                            return quill.root.innerHTML;
                        }
                        // Function to set the editor's content when loading a chapter
                        function setHtml(content) {
                            quill.root.innerHTML = content;
                        }
                    </script>
                </body>
                </html>
                """
            };
            EditorWebView.Source = htmlSource;
        }

        // --- PUBLIC METHODS TO CONTROL THE EDITOR ---

        public async Task<string> GetHtmlAsync()
        {
            // This C# method calls the 'getHtml' JavaScript function inside the WebView
            string html = await EditorWebView.EvaluateJavaScriptAsync("getHtml()");
            // The result from JS is often a JSON string (e.g., "\"<p>Hello</p>\""), so we need to clean it up.
            if (html != null && html.StartsWith("\"") && html.EndsWith("\""))
            {
                html = System.Text.Json.JsonSerializer.Deserialize<string>(html);
            }
            return html;
        }

        public void SetHtml(string htmlContent)
        {
            // This C# method calls the 'setHtml' JavaScript function
            string escapedContent = System.Text.Json.JsonSerializer.Serialize(htmlContent);
            EditorWebView.EvaluateJavaScriptAsync($"setHtml({escapedContent})");
        }

        public void ToggleBold() => EditorWebView.EvaluateJavaScriptAsync("quill.format('bold', !quill.getFormat().bold);");
        public void ToggleItalic() => EditorWebView.EvaluateJavaScriptAsync("quill.format('italic', !quill.getFormat().italic);");
        public void ToggleUnderline() => EditorWebView.EvaluateJavaScriptAsync("quill.format('underline', !quill.getFormat().underline);");
    }
}