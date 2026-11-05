using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Documents;
using System.Windows.Media;

namespace StoryTracker
{
    public partial class MainWindow : Window
    {
        private readonly DatabaseService _dbService;
        private Story? _selectedStory;
        private Chapter? _selectedChapter;
        private List<Story> _allStories = new List<Story>();
        private string? _misspelledWord;
        private readonly ExportService _exportService = new ExportService();
        private readonly EditorService _editorService = new EditorService();

        #region Dependency Properties for Global Font
        public static readonly DependencyProperty AppFontSizeProperty =
            DependencyProperty.Register(nameof(AppFontSize), typeof(double), typeof(MainWindow), new PropertyMetadata(14.0));
        public double AppFontSize { get => (double)GetValue(AppFontSizeProperty); set => SetValue(AppFontSizeProperty, value); }
        public static readonly DependencyProperty AppFontFamilyProperty =
            DependencyProperty.Register(nameof(AppFontFamily), typeof(FontFamily), typeof(MainWindow), new PropertyMetadata(new FontFamily("Segoe UI")));
        public FontFamily AppFontFamily { get => (FontFamily)GetValue(AppFontFamilyProperty); set => SetValue(AppFontFamilyProperty, value); }
        #endregion

        public MainWindow(string connectionString)
        {
            InitializeComponent();
            _dbService = new DatabaseService(connectionString);
            LoadStories();
            SetPlaceholderText();
            TextColorComboBox.ItemsSource = typeof(Brushes).GetProperties().Select(p => new { Name = p.Name });
            this.Loaded += MainWindow_Loaded;

            // --- Corrected Dictionary Loading ---
            Uri dictionaryUri = new Uri("pack://application:,,,/custom.lex");
            if (SpellCheck.GetCustomDictionaries(StoryRichTextBox).Count == 0)
            {
                SpellCheck.GetCustomDictionaries(StoryRichTextBox).Add(dictionaryUri);
            }
            // ---------------------------------

            // Call the new helper method and pass it all the textboxes
            UIHelper.SetInitialPlaceholders(
                SearchTextBox,
                StoryTitleTextBox,
                StoryTypeTextBox,
                GenreTextBox,
                StoryStatusTextBox,
                ChapterTitleTextBox
                );

        }

        private void MainWindow_Loaded(object sender, RoutedEventArgs e)
        {
            WindowAccentHelper.EnableAcrylicBlur(this); // <-- ADD THIS
        }

        #region Story Methods
        private void LoadStories()
        {
            try
            {
                _allStories = _dbService.LoadStoryTitles();
                UpdateStoryListBox();
                AppStatusTextBlock.Text = "Ready.";
            }
            catch (Exception ex) { MessageBox.Show(ex.Message, "Error", MessageBoxButton.OK, MessageBoxImage.Error); }
        }

        private void StoryListBox_SelectionChanged(object sender, SelectionChangedEventArgs e)
        {
            ChapterListBox.ItemsSource = null;
            ClearEditorForm();
            ClearStoryForm();
            if (StoryListBox.SelectedItem is not Story selectedStory) return;

            try
            {
                // Now we fetch the full story details to populate the properties box
                _selectedStory = _dbService.GetStoryDetails(selectedStory.Id); 
                StoryTitleTextBox.Text = _selectedStory.Title; 
                StoryTypeTextBox.Text = _selectedStory.StoryType; 
                GenreTextBox.Text = _selectedStory.Genre; 
                StoryStatusTextBox.Text = _selectedStory.Status; 
                AppStatusTextBlock.Text = $"Selected '{_selectedStory.Title}'."; 
                LoadChaptersForStory(_selectedStory.Id); 
                UpdateTotalWordCount(); // Update the total word count for the selected story
            }
            catch (Exception ex) { MessageBox.Show(ex.Message, "Error", MessageBoxButton.OK, MessageBoxImage.Error); }
        }

        private void AddStoryButton_Click(object sender, RoutedEventArgs e)
        {
            var dialog = new InputDialog("Enter a title for the new story:");
            if (dialog.ShowDialog() == true)
            {
                try
                {
                    _dbService.CreateStory(dialog.Answer);
                    LoadStories(); // Refresh the list
                    AppStatusTextBlock.Text = "New story created.";
                }
                catch (Exception ex) { MessageBox.Show(ex.Message, "Error"); }
            }
        }

        private void DeleteStoryButton_Click(object sender, RoutedEventArgs e)
        {
            if (_selectedStory == null || _selectedStory.Id == 0)
            {
                MessageBox.Show("Please select a story to delete.");
                return;
            }

            if (MessageBox.Show($"Are you sure you want to permanently delete '{_selectedStory.Title}' and all its chapters?", "Confirm Delete", MessageBoxButton.YesNo, MessageBoxImage.Warning) == MessageBoxResult.Yes)
            {
                try
                {
                    _dbService.DeleteStory(_selectedStory.Id);
                    LoadStories();
                    ClearStoryForm();
                    ChapterListBox.ItemsSource = null;
                    AppStatusTextBlock.Text = "Story deleted.";
                }
                catch (Exception ex) { MessageBox.Show(ex.Message, "Error"); }
            }
        }

        private void SaveStoryDetailsButton_Click(object sender, RoutedEventArgs e)
        {
            if (_selectedStory == null || _selectedStory.Id == 0)
            {
                MessageBox.Show("Please select a story first.");
                return;
            }
            try
            {
                _selectedStory.Title = StoryTitleTextBox.Text;
                _selectedStory.StoryType = StoryTypeTextBox.Text;
                _selectedStory.Genre = GenreTextBox.Text;
                _selectedStory.Status = StoryStatusTextBox.Text;
                _dbService.SaveStoryDetails(_selectedStory);
                MessageBox.Show($"Details for '{_selectedStory.Title}' saved successfully!", "Save Successful");
                AppStatusTextBlock.Text = "Story details saved.";
                LoadStories(); // Refresh list in case title changed
            }
            catch (Exception ex) { MessageBox.Show(ex.Message, "Error", MessageBoxButton.OK, MessageBoxImage.Error); }
        }
        private void UpdateTotalWordCount()
        {
            if (_selectedStory != null)
            {
                try
                {
                    int totalCount = _dbService.GetTotalWordCountForStory(_selectedStory.Id);
                    TotalWordCountTextBlock.Text = totalCount.ToString("N0"); // Format with commas
                }
                catch (Exception ex) { MessageBox.Show(ex.Message, "Error"); }
            }
        }
        #endregion

        #region Chapter Methods
        private void LoadChaptersForStory(int storyId)
        {
            try
            {
                var chapters = _dbService.GetChaptersForStory(storyId);
                ChapterListBox.ItemsSource = chapters;
            }
            catch (Exception ex) { MessageBox.Show(ex.Message, "Error", MessageBoxButton.OK, MessageBoxImage.Error); }
        }

        private void ChapterListBox_SelectionChanged(object sender, SelectionChangedEventArgs e)
        {
            if (ChapterListBox.SelectedItem is not Chapter selectedChapter)
            {
                ClearEditorForm();
                return;
            }
            _selectedChapter = selectedChapter;
            try
            {
                string chapterRtfText = _dbService.GetChapterText(_selectedChapter.Id);
                ChapterTitleTextBox.Text = _selectedChapter.Title;
                var textRange = new TextRange(StoryRichTextBox.Document.ContentStart, StoryRichTextBox.Document.ContentEnd);
                if (string.IsNullOrWhiteSpace(chapterRtfText)) { textRange.Text = ""; }
                else
                {
                    using (var memoryStream = new MemoryStream(Encoding.ASCII.GetBytes(chapterRtfText)))
                    {
                        textRange.Load(memoryStream, DataFormats.Rtf);
                    }
                }
                AppStatusTextBlock.Text = $"Editing Chapter {_selectedChapter.ChapterNumber}: {_selectedChapter.Title}";
            }
            catch (Exception ex) { MessageBox.Show(ex.Message, "Error", MessageBoxButton.OK, MessageBoxImage.Error); }
        }

        private void SaveChapterButton_Click(object sender, RoutedEventArgs e)
        {
            if (_selectedChapter == null || _selectedChapter.Id == 0)
            {
                MessageBox.Show("Please select a chapter to save.");
                return;
            }
            var textRange = new TextRange(StoryRichTextBox.Document.ContentStart, StoryRichTextBox.Document.ContentEnd);
            using (var memoryStream = new MemoryStream())
            {
                textRange.Save(memoryStream, DataFormats.Rtf);
                _selectedChapter.Text = Encoding.ASCII.GetString(memoryStream.ToArray());
            }
            _selectedChapter.Title = ChapterTitleTextBox.Text;
            try
            {
                _dbService.SaveChapter(_selectedChapter);
                MessageBox.Show("Chapter saved successfully!");
                AppStatusTextBlock.Text = "Chapter saved.";
                if (_selectedStory != null) 
                    LoadChaptersForStory(_selectedStory.Id);
                UpdateTotalWordCount();
            }
            catch (Exception ex) { MessageBox.Show(ex.Message, "Error", MessageBoxButton.OK, MessageBoxImage.Error); }
        }

        private void AddChapterButton_Click(object sender, RoutedEventArgs e)
        {
            if (_selectedStory == null)
            {
                MessageBox.Show("Please select a story before adding a chapter.");
                return;
            }
            int nextChapterNumber = (ChapterListBox.Items.Count > 0) ? ChapterListBox.Items.Count + 1 : 1;
            try
            {
                // Call the new method, passing an empty string for the content
                _dbService.CreateChapter(_selectedStory.Id, nextChapterNumber, $"New Chapter {nextChapterNumber}", "");
                LoadChaptersForStory(_selectedStory.Id);
            }
            catch (Exception ex) { MessageBox.Show(ex.Message, "Error", MessageBoxButton.OK, MessageBoxImage.Error); }
        }

        private void DeleteChapterButton_Click(object sender, RoutedEventArgs e)
        {
            if (_selectedChapter == null)
            {
                MessageBox.Show("Please select a chapter to delete.");
                return;
            }
            if (MessageBox.Show($"Are you sure you want to delete '{_selectedChapter.Title}'?", "Confirm Delete", MessageBoxButton.YesNo) == MessageBoxResult.Yes)
            {
                try
                {
                    _dbService.DeleteChapter(_selectedChapter.Id);
                    if (_selectedStory != null) LoadChaptersForStory(_selectedStory.Id);
                }
                catch (Exception ex) { MessageBox.Show(ex.Message, "Error", MessageBoxButton.OK, MessageBoxImage.Error); }
            }
        }
        #endregion

        #region Editor and Toolbar Methods
        private void StoryRichTextBox_TextChanged(object sender, TextChangedEventArgs e)
        {
            // --- Get the plain text for word/character counts ---
            string richText = new TextRange(StoryRichTextBox.Document.ContentStart, StoryRichTextBox.Document.ContentEnd).Text;
            int charCount = richText.Length - 2;
            int wordCount = richText.Split(new[] { ' ', '\r', '\n' }, StringSplitOptions.RemoveEmptyEntries).Length;

            LiveCharCountTextBlock.Text = $"Characters: {Math.Max(0, charCount)}";
            LiveWordCountTextBlock.Text = $"Word Count: {wordCount}";

            // --- Universal Spelling Error Count Logic ---
            int errorCount = 0;
            // We'll iterate through the plain text and check each word
            var words = richText.Split(new[] { ' ', '\r', '\n' }, StringSplitOptions.RemoveEmptyEntries);

            // This is a simplified check and may not be perfectly performant,
            // but it avoids the version-specific API issues.
            // A full implementation would be much more complex.

            // For now, let's disable the live error count to prevent further issues,
            // as a reliable, cross-version implementation is very complex.
            SpellingErrorsTextBlock.Text = "Spelling Errors: N/A";
        }
        private void StrikethroughButton_Click(object sender, RoutedEventArgs e)
        {
            _editorService.ToggleStrikethrough(StoryRichTextBox);
        }

        private void FontFamilyComboBox_SelectionChanged(object sender, SelectionChangedEventArgs e)
        {
            if (FontFamilyComboBox.SelectedItem is ComboBoxItem selectedItem && selectedItem.Content is string fontFamily)
            {
                _editorService.ChangeFontFamily(StoryRichTextBox, fontFamily);
            }
        }

        private void FontSizeComboBox_TextChanged(object sender, TextChangedEventArgs e)
        {
            _editorService.ChangeFontSize(StoryRichTextBox, FontSizeComboBox.Text);
        }

        private void TextColorComboBox_SelectionChanged(object sender, SelectionChangedEventArgs e)
        {
            if (TextColorComboBox.SelectedItem != null)
            {
                string colorName = (string)TextColorComboBox.SelectedValue;
                _editorService.ChangeTextColor(StoryRichTextBox, colorName);
            }
        }

        private void StoryRichTextBox_ContextMenuOpening(object sender, ContextMenuEventArgs e)
        {
            var spellingError = StoryRichTextBox.GetSpellingError(StoryRichTextBox.CaretPosition);
            if (spellingError != null)
            {
                _misspelledWord = spellingError.Suggestions.FirstOrDefault();
                AddToDictionaryMenuItem.IsEnabled = true;
            }
            else
            {
                _misspelledWord = null;
                AddToDictionaryMenuItem.IsEnabled = false;
            }
        }

        private void AddToDictionaryMenuItem_Click(object sender, RoutedEventArgs e)
        {
            if (!string.IsNullOrEmpty(_misspelledWord))
            {
                File.AppendAllText("custom.lex", _misspelledWord + Environment.NewLine);
                // No direct "IgnoreAll" in this context, adding to dictionary is the action
            }
        }
        #endregion

        #region Search Box Methods
        private void UpdateStoryListBox()
        {
            var searchText = SearchTextBox.Text;
            if (string.IsNullOrWhiteSpace(searchText) || searchText == "Search by Title...") { StoryListBox.ItemsSource = _allStories; }
            else
            {
                var filteredStories = _allStories.Where(story => story.Title.Contains(searchText, StringComparison.OrdinalIgnoreCase));
                StoryListBox.ItemsSource = filteredStories;
            }
        }
        private void SearchTextBox_TextChanged(object sender, TextChangedEventArgs e) { if (SearchTextBox.Text != "Search by Title...") { UpdateStoryListBox(); } }
        private void SetPlaceholderText()
        {
            if (string.IsNullOrEmpty(SearchTextBox.Text))
            {
                SearchTextBox.Text = "Search by Title...";
                SearchTextBox.Foreground = Brushes.Gray;
                SearchTextBox.FontStyle = FontStyles.Italic;
            }
        }
        private void TextBox_GotFocus(object sender, RoutedEventArgs e)
        {
            UIHelper.TextBox_GotFocus(sender, e);
        }

        private void TextBox_LostFocus(object sender, RoutedEventArgs e)
        {
            UIHelper.TextBox_LostFocus(sender, e);
        }
        #endregion

        #region Form Clearing and Other Helpers
        private void ClearStoryForm()
        {
            _selectedStory = null;
            StoryTitleTextBox.Text = "";
            StoryTypeTextBox.Text = "";
            GenreTextBox.Text = "";
            StoryStatusTextBox.Text = "";
        }
        private void ClearEditorForm()
        {
            _selectedChapter = null;
            ChapterTitleTextBox.Text = "";
            StoryRichTextBox.Document.Blocks.Clear();
            LiveCharCountTextBlock.Text = "Characters: 0";
            LiveWordCountTextBlock.Text = "Word Count: 0";
        }
        #endregion

        #region Main Menu Click Handlers
        private void ExitMenuItem_Click(object sender, RoutedEventArgs e) { Application.Current.Shutdown(); }
        private void AboutMenuItem_Click(object sender, RoutedEventArgs e) { new AboutWindow().ShowDialog(); }
        private void ThemeMenuItem_Click(object sender, RoutedEventArgs e)
        {
            var menuItem = sender as MenuItem;
            if (menuItem == null || menuItem.Header == null) return;
            string header = menuItem.Header.ToString().Replace("_", "");
            string themeName;
            if (header == "Light Theme" || header == "Dark Theme") { themeName = header.Replace(" ", "") + ".xaml"; }
            else { themeName = header.Replace("/", "").Replace(" ", "") + "Theme.xaml"; }
            try
            {
                Application.Current.Resources.MergedDictionaries.Clear();
                Application.Current.Resources.MergedDictionaries.Add(new ResourceDictionary { Source = new Uri($"Themes/{themeName}", UriKind.Relative) });
                File.WriteAllText("theme.settings", themeName);
            }
            catch (Exception ex) { MessageBox.Show($"Could not load theme: {themeName}\n{ex.Message}"); }
        }
        private void FontSizeMenuItem_Click(object sender, RoutedEventArgs e)
        {
            if (sender is MenuItem menuItem && double.TryParse(menuItem.Header.ToString(), out double newSize))
            {
                // This sets the global font size property for the whole window
                AppFontSize = newSize;
            }
        }
        private void SelectAllButton_Click(object sender, RoutedEventArgs e)
        {
            StoryRichTextBox.SelectAll();
        }
        private void FontFamilyMenuItem_Click(object sender, RoutedEventArgs e)
        {
            if (sender is MenuItem menuItem)
            {
                // This sets the global font family property for the whole window
                AppFontFamily = new FontFamily(menuItem.Header.ToString());
            }
        }
        private void ExportTxtMenuItem_Click(object sender, RoutedEventArgs e)
        {
            if (_selectedChapter == null)
            {
                MessageBox.Show("Please select a chapter to export.");
                return;
            }
            try
            {
                _exportService.ExportToTxt(StoryRichTextBox, _selectedChapter.Title);
                AppStatusTextBlock.Text = "Chapter exported successfully.";
            }
            catch (Exception ex)
            {
                MessageBox.Show($"Failed to export file: {ex.Message}");
            }
        }
        private void ExportRtfMenuItem_Click(object sender, RoutedEventArgs e)
        {
            if (_selectedChapter == null)
            {
                MessageBox.Show("Please select a chapter to export.");
                return;
            }
            try
            {
                _exportService.ExportToRtf(StoryRichTextBox, _selectedChapter.Title);
                AppStatusTextBlock.Text = "Chapter exported successfully.";
            }
            catch (Exception ex)
            {
                MessageBox.Show($"Failed to export file: {ex.Message}");
            }
        }
        private void PrintPreviewMenuItem_Click(object sender, RoutedEventArgs e)
        {
            if (_selectedChapter == null)
            {
                MessageBox.Show("Please select a chapter to preview.");
                return;
            }

            // Pass the current RichTextBox document to the new PreviewWindow
            var preview = new PreviewWindow(StoryRichTextBox.Document, _selectedChapter.Title);
            preview.Show();
        }
        private void ExportStoryRtfMenuItem_Click(object sender, RoutedEventArgs e)
        {
            // 1. Make sure a story is selected
            if (_selectedStory == null)
            {
                MessageBox.Show("Please select a story to export.");
                return;
            }

            // 2. Set up the Save File Dialog
            var saveFileDialog = new Microsoft.Win32.SaveFileDialog
            {
                FileName = $"{_selectedStory.Title}.rtf",
                Filter = "Rich Text Format (*.rtf)|*.rtf"
            };

            if (saveFileDialog.ShowDialog() == true)
            {
                try
                {
                    // 3. Create a new, empty document to hold everything
                    var finalDocument = new FlowDocument();

                    // 4. Get the list of all chapters for the story
                    var chapters = _dbService.GetChaptersForStory(_selectedStory.Id);

                    foreach (var chapter in chapters)
                    {
                        var titleParagraph = new Paragraph(new Run($"Chapter {chapter.ChapterNumber}: {chapter.Title}"))
                        {
                            FontSize = 18,
                            FontWeight = FontWeights.Bold,
                            TextAlignment = TextAlignment.Center,
                            Margin = new Thickness(0, 0, 0, 20)
                        };
                        finalDocument.Blocks.Add(titleParagraph);

                        string chapterRtf = _dbService.GetChapterText(chapter.Id);
                        if (!string.IsNullOrEmpty(chapterRtf))
                        {
                            var tempDoc = new FlowDocument();
                            var textRange = new TextRange(tempDoc.ContentStart, tempDoc.ContentEnd);
                            using (var memoryStream = new MemoryStream(Encoding.ASCII.GetBytes(chapterRtf)))
                            {
                                textRange.Load(memoryStream, DataFormats.Rtf);
                            }

                            var blocks = new List<Block>(tempDoc.Blocks);
                            foreach (var block in blocks)
                            {
                                tempDoc.Blocks.Remove(block);
                                finalDocument.Blocks.Add(block);
                            }
                        }

                        // 8. Save the final, combined document to a file
                        var finalRange = new TextRange(finalDocument.ContentStart, finalDocument.ContentEnd);
                        using (var fileStream = new FileStream(saveFileDialog.FileName, FileMode.Create))
                        {
                            finalRange.Save(fileStream, DataFormats.Rtf);
                        }

                        // Call the new service method with the combined document
                        _exportService.ExportToDocx(finalDocument, _selectedStory.Title);
                        AppStatusTextBlock.Text = "Story exported to .docx successfully.";
                    }
                }
                catch (Exception ex)
                {
                    MessageBox.Show($"Failed to export file: {ex.Message}");
                }
            }
        }
        private void ExportChapterDocxMenuItem_Click(object sender, RoutedEventArgs e)
        {
            if (_selectedChapter == null)
            {
                MessageBox.Show("Please select a chapter to export.");
                return;
            }

            try
            {
                // Pass the RichTextBox document and chapter title to the service
                _exportService.ExportToDocx(StoryRichTextBox.Document, _selectedChapter.Title);
                AppStatusTextBlock.Text = "Chapter exported to .docx successfully.";
            }
            catch (Exception ex)
            {
                MessageBox.Show($"Failed to export file: {ex.Message}");
            }
        }
        private void ExportStoryPdfMenuItem_Click(object sender, RoutedEventArgs e)
        {
            if (_selectedStory == null)
            {
                MessageBox.Show("Please select a story to export.");
                return;
            }

            try
            {
                // This logic is identical to the other full-story exports
                var finalDocument = new FlowDocument();
                var chapters = _dbService.GetChaptersForStory(_selectedStory.Id);
                foreach (var chapter in chapters)
                {
                    var titleParagraph = new Paragraph(new Run($"Chapter {chapter.ChapterNumber}: {chapter.Title}"))
                    {
                        FontSize = 18,
                        FontWeight = FontWeights.Bold,
                        TextAlignment = TextAlignment.Center,
                        Margin = new Thickness(0, 0, 0, 20)
                    };
                    finalDocument.Blocks.Add(titleParagraph);

                    string chapterRtf = _dbService.GetChapterText(chapter.Id);
                    if (!string.IsNullOrEmpty(chapterRtf))
                    {
                        var tempDoc = new FlowDocument();
                        var textRange = new TextRange(tempDoc.ContentStart, tempDoc.ContentEnd);
                        using (var memoryStream = new MemoryStream(Encoding.ASCII.GetBytes(chapterRtf)))
                        {
                            textRange.Load(memoryStream, DataFormats.Rtf);
                        }
                        var blocks = new List<Block>(tempDoc.Blocks.ToList());
                        foreach (var block in blocks)
                        {
                            tempDoc.Blocks.Remove(block);
                            finalDocument.Blocks.Add(block);
                        }
                    }
                }

                // Call the new service method with the combined document
                _exportService.ExportToPdf(finalDocument, _selectedStory.Title);
                AppStatusTextBlock.Text = "Story exported to .pdf successfully.";
            }
            catch (Exception ex)
            {
                MessageBox.Show($"Failed to export file: {ex.Message}");
            }
        }
        private void ExportChapterPdfMenuItem_Click(object sender, RoutedEventArgs e)
        {
            if (_selectedChapter == null)
            {
                MessageBox.Show("Please select a chapter to export.");
                return;
            }

            try
            {
                // Pass the RichTextBox document and chapter title to the service
                _exportService.ExportToPdf(StoryRichTextBox.Document, _selectedChapter.Title);
                AppStatusTextBlock.Text = "Chapter exported to .pdf successfully.";
            }
            catch (Exception ex)
            {
                MessageBox.Show($"Failed to export file: {ex.Message}");
            }
        }
        private void PrintStoryMenuItem_Click(object sender, RoutedEventArgs e)
        {
            // 1. Make sure a story is selected
            if (_selectedStory == null)
            {
                MessageBox.Show("Please select a story to print.");
                return;
            }

            try
            {
                // 2. Build the full story document in memory (same logic as export)
                var finalDocument = new FlowDocument();
                var chapters = _dbService.GetChaptersForStory(_selectedStory.Id);
                foreach (var chapter in chapters)
                {
                    var titleParagraph = new Paragraph(new Run($"Chapter {chapter.ChapterNumber}: {chapter.Title}"))
                    {
                        FontSize = 18,
                        FontWeight = FontWeights.Bold,
                        TextAlignment = TextAlignment.Center,
                        Margin = new Thickness(0, 0, 0, 20)
                    };
                    finalDocument.Blocks.Add(titleParagraph);

                    string chapterRtf = _dbService.GetChapterText(chapter.Id);
                    if (!string.IsNullOrEmpty(chapterRtf))
                    {
                        var tempDoc = new FlowDocument();
                        var textRange = new TextRange(tempDoc.ContentStart, tempDoc.ContentEnd);
                        using (var memoryStream = new MemoryStream(Encoding.ASCII.GetBytes(chapterRtf)))
                        {
                            textRange.Load(memoryStream, DataFormats.Rtf);
                        }
                        var blocks = new List<Block>(tempDoc.Blocks.ToList());
                        foreach (var block in blocks)
                        {
                            tempDoc.Blocks.Remove(block);
                            finalDocument.Blocks.Add(block);
                        }
                    }
                }

                // 3. Send the combined document to the print dialog
                var printDialog = new PrintDialog();
                if (printDialog.ShowDialog() == true)
                {
                    printDialog.PrintDocument(((IDocumentPaginatorSource)finalDocument).DocumentPaginator, $"Printing Story: {_selectedStory.Title}");
                    AppStatusTextBlock.Text = "Story sent to printer.";
                }
            }
            catch (Exception ex)
            {
                MessageBox.Show($"Failed to print story: {ex.Message}");
            }
        }
        private void ExportStoryDocxMenuItem_Click(object sender, RoutedEventArgs e)
        {
            if (_selectedStory == null)
            {
                MessageBox.Show("Please select a story to export.");
                return;
            }

            try
            {
                // This logic builds the full story document from all its chapters
                var finalDocument = new FlowDocument();
                var chapters = _dbService.GetChaptersForStory(_selectedStory.Id);

                foreach (var chapter in chapters)
                {
                    var titleParagraph = new Paragraph(new Run($"Chapter {chapter.ChapterNumber}: {chapter.Title}"))
                    {
                        FontSize = 18,
                        FontWeight = FontWeights.Bold,
                        TextAlignment = TextAlignment.Center,
                        Margin = new Thickness(0, 0, 0, 20)
                    };
                    finalDocument.Blocks.Add(titleParagraph);

                    string chapterRtf = _dbService.GetChapterText(chapter.Id);
                    if (!string.IsNullOrEmpty(chapterRtf))
                    {
                        var tempDoc = new FlowDocument();
                        var textRange = new TextRange(tempDoc.ContentStart, tempDoc.ContentEnd);
                        using (var memoryStream = new MemoryStream(Encoding.ASCII.GetBytes(chapterRtf)))
                        {
                            textRange.Load(memoryStream, DataFormats.Rtf);
                        }

                        var blocks = new List<Block>(tempDoc.Blocks.ToList());
                        foreach (var block in blocks)
                        {
                            tempDoc.Blocks.Remove(block);
                            finalDocument.Blocks.Add(block);
                        }
                    }
                }

                // Call the service method with the combined document
                _exportService.ExportToDocx(finalDocument, _selectedStory.Title);
                AppStatusTextBlock.Text = "Story exported to .docx successfully.";
            }
            catch (Exception ex)
            {
                MessageBox.Show($"Failed to export file: {ex.Message}");
            }
        }
        private void ImportTxtMenuItem_Click(object sender, RoutedEventArgs e)
        {
            if (_selectedStory == null)
            {
                MessageBox.Show("Please select a story to import the chapter into.");
                return;
            }

            var openFileDialog = new Microsoft.Win32.OpenFileDialog { Filter = "Text Documents (*.txt)|*.txt" };
            if (openFileDialog.ShowDialog() == true)
            {
                try
                {
                    string fileContent = File.ReadAllText(openFileDialog.FileName);
                    string chapterTitle = Path.GetFileNameWithoutExtension(openFileDialog.FileName);
                    int nextChapterNumber = (ChapterListBox.Items.Count > 0) ? ChapterListBox.Items.Count + 1 : 1;

                    // Convert the plain text to a simple RTF document
                    var doc = new FlowDocument(new Paragraph(new Run(fileContent)));
                    var range = new TextRange(doc.ContentStart, doc.ContentEnd);
                    string rtfContent;
                    using (var ms = new MemoryStream())
                    {
                        range.Save(ms, DataFormats.Rtf);
                        rtfContent = Encoding.ASCII.GetString(ms.ToArray());
                    }

                    // Call the new service method that accepts content
                    _dbService.CreateChapter(_selectedStory.Id, nextChapterNumber, chapterTitle, rtfContent);

                    LoadChaptersForStory(_selectedStory.Id);
                    AppStatusTextBlock.Text = "Chapter imported successfully.";
                }
                catch (Exception ex)
                {
                    MessageBox.Show($"Failed to import file: {ex.Message}");
                }
            }
        }
        private void ImportRtfMenuItem_Click(object sender, RoutedEventArgs e)
        {
            if (_selectedStory == null)
            {
                MessageBox.Show("Please select a story to import the chapter into.");
                return;
            }

            var openFileDialog = new Microsoft.Win32.OpenFileDialog
            {
                Filter = "Rich Text Format (*.rtf)|*.rtf"
            };

            if (openFileDialog.ShowDialog() == true)
            {
                try
                {
                    // Read the raw RTF file content as a string
                    string rtfContent = File.ReadAllText(openFileDialog.FileName);
                    string chapterTitle = Path.GetFileNameWithoutExtension(openFileDialog.FileName);
                    int nextChapterNumber = (ChapterListBox.Items.Count > 0) ? ChapterListBox.Items.Count + 1 : 1;

                    // Call the service method that accepts RTF content
                    _dbService.CreateChapter(_selectedStory.Id, nextChapterNumber, chapterTitle, rtfContent);

                    LoadChaptersForStory(_selectedStory.Id);
                    AppStatusTextBlock.Text = "RTF chapter imported successfully.";
                }
                catch (Exception ex)
                {
                    MessageBox.Show($"Failed to import file: {ex.Message}");
                }
            }
        }
        #endregion

    }
}