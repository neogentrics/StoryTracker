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
        }
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
            }
            catch (Exception ex) { MessageBox.Show(ex.Message, "Error", MessageBoxButton.OK, MessageBoxImage.Error); }
        }

        private void AddStoryButton_Click(object sender, RoutedEventArgs e) { MessageBox.Show("Adding a new story is not yet implemented in v2.0."); }
        private void DeleteStoryButton_Click(object sender, RoutedEventArgs e) { MessageBox.Show("Deleting a story is not yet implemented in v2.0."); }

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
                MessageBox.Show("Story details saved!");
                AppStatusTextBlock.Text = "Story details saved.";
                LoadStories(); // Refresh list in case title changed
            }
            catch (Exception ex) { MessageBox.Show(ex.Message, "Error", MessageBoxButton.OK, MessageBoxImage.Error); }
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
                if (_selectedStory != null) LoadChaptersForStory(_selectedStory.Id);
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
                _dbService.CreateChapter(_selectedStory.Id, nextChapterNumber, $"New Chapter {nextChapterNumber}");
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
            string richText = new TextRange(StoryRichTextBox.Document.ContentStart, StoryRichTextBox.Document.ContentEnd).Text;
            int charCount = richText.Length - 2;
            int wordCount = richText.Split(new[] { ' ', '\r', '\n' }, StringSplitOptions.RemoveEmptyEntries).Length;
            LiveCharCountTextBlock.Text = $"Characters: {Math.Max(0, charCount)}";
            LiveWordCountTextBlock.Text = $"Word Count: {wordCount}";
        }
        private void FontFamilyComboBox_SelectionChanged(object sender, SelectionChangedEventArgs e)
        {
            if (FontFamilyComboBox.SelectedItem is ComboBoxItem selectedItem && selectedItem.Content is string fontFamily)
            {
                StoryRichTextBox.Selection.ApplyPropertyValue(TextElement.FontFamilyProperty, new FontFamily(fontFamily));
            }
        }
        private void FontSizeComboBox_TextChanged(object sender, TextChangedEventArgs e)
        {
            if (double.TryParse(FontSizeComboBox.Text, out double newSize))
            {
                StoryRichTextBox.Selection.ApplyPropertyValue(TextElement.FontSizeProperty, newSize);
            }
        }
        private void TextColorComboBox_SelectionChanged(object sender, SelectionChangedEventArgs e)
        {
            // Make sure an item is actually selected
            if (TextColorComboBox.SelectedItem == null) return;

            // Get the name of the selected color
            string colorName = (string)TextColorComboBox.SelectedValue;

            // Convert the color name into a Brush and apply it to the selected text
            var converter = new BrushConverter();
            if (converter.ConvertFromString(colorName) is Brush newBrush)
            {
                StoryRichTextBox.Selection.ApplyPropertyValue(TextElement.ForegroundProperty, newBrush);
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
        private void SearchTextBox_GotFocus(object sender, RoutedEventArgs e)
        {
            if (SearchTextBox.Text == "Search by Title...")
            {
                SearchTextBox.Text = "";
                SearchTextBox.SetResourceReference(ForegroundProperty, "ForegroundColor");
                SearchTextBox.FontStyle = FontStyles.Normal;
            }
        }
        private void SearchTextBox_LostFocus(object sender, RoutedEventArgs e) { SetPlaceholderText(); }
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

        private void FontFamilyMenuItem_Click(object sender, RoutedEventArgs e)
        {
            if (sender is MenuItem menuItem)
            {
                // This sets the global font family property for the whole window
                AppFontFamily = new FontFamily(menuItem.Header.ToString());
            }
        }
        #endregion
    }
}